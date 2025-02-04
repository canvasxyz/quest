import dayjs from "dayjs"
import { Button as RadixButton, DropdownMenu, TextField, Select } from "@radix-ui/themes"
import React, { useState } from "react"
import { BiFilter } from "react-icons/bi"
import {
  TbAdjustmentsHorizontal,
  TbCalendar,
  TbLayoutGrid,
  TbRefresh,
  TbSearch,
  TbUser,
} from "react-icons/tb"
import { useSearchParams } from "react-router-dom-v5-compat"
import useSWR from "swr"
import { Box, Flex, Text } from "theme-ui"

import { ClickableChecklistItem } from "../../../components/ClickableChecklistItem"
import { FipEntry } from "./fip_entry"
import { statusOptions } from "./status_options"
import { useFipDisplayOptions } from "./useFipDisplayOptions"
import { DatePicker, DateRange } from "./date_picker"
import { FipVersion } from "../../../util/types"
import { getAuthorKey, splitAuthors, UserInfo } from "./splitAuthors"
import { IsVisibleObserver } from "../../../components/IsVisibleObserver"

function cleanFipType(originalFipType: string) {
  let fip_type = ""
  const fip_categories = []

  if (originalFipType.indexOf("Core") !== -1) {
    fip_type = "Technical"
    fip_categories.push("Core")
  }
  if (originalFipType.indexOf("Networking") !== -1) {
    fip_type = "Technical"
    fip_categories.push("Networking")
  }
  if (originalFipType.indexOf("Interface") !== -1) {
    fip_type = "Technical"
    fip_categories.push("Interface")
  }
  if (originalFipType.indexOf("Informational") !== -1) {
    fip_type = "Technical"
    fip_categories.push("Informational")
  }

  if (originalFipType.indexOf("Technical") !== -1) {
    fip_type = "Technical"
  }

  if (originalFipType.indexOf("Organizational") !== -1) {
    fip_type = "Organizational"
  }

  if (originalFipType.indexOf("FRC") !== -1) {
    fip_type = "FRC"
  }

  if (originalFipType.indexOf("Standards") !== -1) {
    fip_type = "Standards"
  }

  if (originalFipType.indexOf("N/A") !== -1) {
    fip_type = "N/A"
  }

  return { fip_type, fip_category: fip_categories.join(", ") }
}

function processFipVersions(data: FipVersion[]) {
  if (!data) {
    return {}
  }

  // these two objects are used to populate the options in the filter menus
  const allFipTypesSet = new Set<string | null>()
  const allFipAuthors: Map<string, UserInfo> = new Map()

  // filter the fip versions so that we try to have at most one fip version per fip_number
  const conversations = Object.entries(
    Object.groupBy(data, (fip_version) => fip_version.fip_number),
  )
    .map(([fip_number, rows]) => {
      if (fip_number === "null" || fip_number === "0") {
        // return all open fip_versions where the fip_number is null/zero
        return rows.filter((row) => !row.github_pr?.merged_at && !row.github_pr?.closed_at)
      }

      // if there is a fip_version without a PR then just return this
      const rowWithNullGithubPr = rows.find((fip_version) => fip_version.github_pr === null)
      if (rowWithNullGithubPr) {
        return [rowWithNullGithubPr]
      }

      // try to return the open PRs if there are any
      const rowsWithOpenPrs = rows.filter(
        (row) => !row.github_pr?.merged_at && !row.github_pr?.closed_at,
      )
      if (rowsWithOpenPrs.length > 0) {
        return rowsWithOpenPrs
      }

      // otherwise return the closed PRs
      return rows
    })
    // flatten the groups so that we have a list of fip_versions entries
    .flat()
    // don't show fips that don't have a fip status
    .filter((conversation) => conversation.fip_status !== null)
    // transform the individual records and collect the filter options (allFipAuthors, allFipTypesSet, etc)
    .map((conversation) => {
      const { fip_type, fip_category } = cleanFipType(conversation.fip_type)
      allFipTypesSet.add(fip_type)

      const authors = splitAuthors(conversation.fip_author) || []
      for (const author of authors) {
        allFipAuthors[getAuthorKey(author)] = author
      }

      let fipStatusKey = conversation.fip_status.toLowerCase().replace(" ", "-")
      if (fipStatusKey === "wip") {
        fipStatusKey = "draft"
      } else if (!conversation.fip_status) {
        fipStatusKey = "unknown"
      }
      if (conversation.github_pr?.merged_at || conversation.github_pr?.closed_at) {
        fipStatusKey = "closed"
      }

      return {
        ...conversation,
        fip_authors: authors,
        fip_type,
        fipStatusKey,
        fip_category,
        displayed_title: conversation.fip_title || conversation.github_pr.title,
      }
    })

  const allFipTypes = Array.from(allFipTypesSet)
  allFipTypes.sort((a, b) => a.localeCompare(b))

  return { conversations, allFipTypes, allFipAuthors }
}

const FipTracker = () => {
  const allFipStatuses = Object.keys(statusOptions)
  const [selectedFipStatuses, setSelectedFipStatuses] = useState<Record<string, boolean>>(
    Object.fromEntries(allFipStatuses.map((status) => [status, true])),
  )

  const {
    showAuthors,
    setShowAuthors,
    showCategory,
    setShowCategory,
    showCreationDate,
    setShowCreationDate,
    showType,
    setShowType,
    sortBy,
    setSortBy,
    resetDisplayOptions,
    saveDisplayOptions,
  } = useFipDisplayOptions()

  const [searchParams, setSearchParams] = useSearchParams()

  const searchParam = searchParams.get("search") || ""

  const [scrollCursor, setScrollCursor] = useState(0)
  const scrollPageSize = 10

  const { data } = useSWR(
    `fips`,
    async () => {
      const response = await fetch(`/api/v3/fips`)
      const data = await response.json()
      return processFipVersions(data)
    },
    { keepPreviousData: true, focusThrottleInterval: 500 },
  )
  const { conversations, allFipTypes, allFipAuthors } = data || {}

  const [deselectedFipTypes, setDeselectedFipTypes] = useState<Record<string, boolean>>({})
  const [deselectedFipAuthors, setDeselectedFipAuthors] = useState<Record<string, boolean>>({})
  const [unlabeledAuthorDeselected, setUnlabeledAuthorDeselected] = useState<boolean>(false)

  const [rangeValue, setRangeValue] = useState<DateRange>({ start: null, end: null })

  const getFipCreated = (c) => {
    // Clean up some bad dates
    if (!c.fip_created && c.fip_number === 4) {
      return dayjs("2020-10-15").valueOf()
    }
    const parsed = dayjs(
      c.fip_created?.replace(/<|>/g, "").replace("2022-0218", "2022-02-18"),
    ).valueOf()
    return isNaN(parsed) ? 0 : parsed
  }

  let sortFunction
  if (sortBy === "asc") {
    sortFunction = (c1, c2) => (getFipCreated(c1) > getFipCreated(c2) ? 1 : -1)
  } else if (sortBy === "desc") {
    sortFunction = (c1, c2) => (getFipCreated(c1) > getFipCreated(c2) ? -1 : 1)
  } else if (sortBy === "fip_number_asc") {
    sortFunction = (c1, c2) => (c1.fip_number === null ? 1 : c1.fip_number > c2.fip_number ? 1 : -1)
  } else {
    sortFunction = (c1, c2) =>
      c1.fip_number === null
        ? -1
        : c1.fip_number === 9999
          ? 1
          : c1.fip_number < c2.fip_number
            ? 1
            : -1
  }

  const displayedFips = (conversations || [])
    .filter((conversation) => {
      // the conversation's displayed title must include the search string, if it is given
      if (
        searchParam &&
        !(conversation.displayed_title || "").toLowerCase().includes(searchParam.toLowerCase())
      ) {
        return false
      }

      // the conversation must have one of the selected fip authors
      if (conversation.fip_authors.length === 0) {
        if (unlabeledAuthorDeselected) {
          return false
        }
      } else {
        let hasMatchingFipAuthor = false
        for (const fipAuthor of conversation.fip_authors) {
          const key = getAuthorKey(fipAuthor)
          if (deselectedFipAuthors[key] !== true) {
            hasMatchingFipAuthor = true
            break
          }
        }
        if (!hasMatchingFipAuthor) {
          return false
        }
      }

      if (conversation.github_pr?.merged_at || conversation.github_pr?.closed_at) {
        // conversation is closed
        if (!selectedFipStatuses.closed) {
          return false
        }
      } else if (conversation.fip_status) {
        let fipStatusKey = conversation.fip_status.toLowerCase().replace(" ", "-")
        if (fipStatusKey === "wip") {
          fipStatusKey = "draft"
        }

        if (!selectedFipStatuses[fipStatusKey]) {
          return false
        }
      }

      // the conversation's fip type must be one of the selected fip types
      if (conversation.fip_type && deselectedFipTypes[conversation.fip_type]) {
        return false
      }

      if (rangeValue.start && rangeValue.end) {
        const conversationDate = new Date(Date.parse(conversation.fip_created))
        if (conversationDate < rangeValue.start || conversationDate > rangeValue.end) {
          return false
        }
      }

      return true
    })
    .toSorted(sortFunction)
    .slice(0, scrollCursor + scrollPageSize)

  return (
    <Flex
      sx={{
        px: [3],
        py: [3],
        pt: [7],
        flexDirection: "column",
        gap: [3],
      }}
    >
      <Text sx={{ fontWeight: 600, fontSize: [2] }}>FIP Tracker</Text>
      <Flex sx={{ gap: [2], width: "100%" }}>
        <Box sx={{ flexGrow: "1", maxWidth: "400px" }}>
          <TextField.Root
            placeholder="Search..."
            value={(searchParams as any).get("search") || ""}
            onChange={(e) => {
              setScrollCursor(0)
              setSearchParams({ search: e.target.value })
            }}
          >
            <TextField.Slot>
              <TbSearch style={{ color: "#B4B6C2" }} />
            </TextField.Slot>
          </TextField.Root>
        </Box>
        <Box sx={{ flexGrow: "1" }}></Box>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <RadixButton variant="surface">
              <BiFilter size="1.1em" style={{ color: "var(--accent-a11)", top: "-1px" }} />
              Filters
            </RadixButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger>
                <TbUser /> Authors
              </DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent>
                <ClickableChecklistItem
                  color={"blue"}
                  checked={
                    Object.values(deselectedFipAuthors).every((value) => value !== true) &&
                    !unlabeledAuthorDeselected
                  }
                  setChecked={(value) => {
                    setScrollCursor(0)
                    setDeselectedFipAuthors(() =>
                      Object.fromEntries(
                        Object.keys(allFipAuthors || {}).map((key) => [key, !value]),
                      ),
                    )
                    setUnlabeledAuthorDeselected(!value)
                  }}
                >
                  All
                </ClickableChecklistItem>
                <ClickableChecklistItem
                  color={"blue"}
                  checked={!unlabeledAuthorDeselected}
                  setChecked={(value) => {
                    setUnlabeledAuthorDeselected(!value)
                  }}
                  showOnly={true}
                  selectOnly={() => {
                    setScrollCursor(0)
                    setDeselectedFipAuthors(() =>
                      Object.fromEntries(
                        Object.keys(allFipAuthors || {}).map((key) => [key, true]),
                      ),
                    )
                    setUnlabeledAuthorDeselected(false)
                  }}
                >
                  Unlabeled
                </ClickableChecklistItem>
                <DropdownMenu.Separator />
                {Object.keys(allFipAuthors || {})
                  .toSorted((a, b) => a.localeCompare(b))
                  .map((fipAuthor) => (
                    <ClickableChecklistItem
                      key={fipAuthor}
                      color={"blue"}
                      checked={deselectedFipAuthors[fipAuthor] !== true}
                      setChecked={(value) => {
                        setScrollCursor(0)
                        setDeselectedFipAuthors((prev) => ({ ...prev, [fipAuthor]: !value }))
                      }}
                      showOnly={true}
                      selectOnly={() => {
                        setScrollCursor(0)
                        setDeselectedFipAuthors(() =>
                          Object.fromEntries(
                            Object.keys(allFipAuthors || {}).map((key) => [key, key !== fipAuthor]),
                          ),
                        )
                      }}
                    >
                      {allFipAuthors[fipAuthor].username
                        ? `@${allFipAuthors[fipAuthor].username}`
                        : allFipAuthors[fipAuthor].email}
                    </ClickableChecklistItem>
                  ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger>
                <TbRefresh /> Status
              </DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent>
                <ClickableChecklistItem
                  color={"blue"}
                  checked={Object.values(selectedFipStatuses).every((value) => value === true)}
                  setChecked={(value) => {
                    setScrollCursor(0)
                    setSelectedFipStatuses(() =>
                      Object.fromEntries(allFipStatuses.map((key) => [key, value])),
                    )
                  }}
                >
                  All
                </ClickableChecklistItem>
                <DropdownMenu.Separator />
                {allFipStatuses.map((fipStatus) => (
                  <ClickableChecklistItem
                    key={fipStatus}
                    color={statusOptions[fipStatus].color}
                    checked={selectedFipStatuses[fipStatus]}
                    setChecked={(value) => {
                      setScrollCursor(0)
                      setSelectedFipStatuses((prev) => ({ ...prev, [fipStatus]: value }))
                    }}
                    showOnly={true}
                    selectOnly={() => {
                      setScrollCursor(0)
                      setSelectedFipStatuses(() =>
                        Object.fromEntries(allFipStatuses.map((key) => [key, key === fipStatus])),
                      )
                    }}
                  >
                    {statusOptions[fipStatus].label}
                  </ClickableChecklistItem>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger>
                <TbCalendar /> Date
              </DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent>
                <DatePicker
                  rangeValue={rangeValue}
                  onRangeValueChange={(range) => setRangeValue(range)}
                />
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger>
                <TbLayoutGrid /> Type
              </DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent>
                <ClickableChecklistItem
                  color={"blue"}
                  checked={Object.values(deselectedFipTypes).every((value) => value !== true)}
                  setChecked={(value) => {
                    setScrollCursor(0)
                    setDeselectedFipTypes(() =>
                      Object.fromEntries(allFipTypes.map((key) => [key, !value])),
                    )
                  }}
                >
                  All
                </ClickableChecklistItem>
                <DropdownMenu.Separator />
                {(allFipTypes || []).map((fipType) => (
                  <ClickableChecklistItem
                    key={fipType}
                    color={"blue"}
                    checked={deselectedFipTypes[fipType] !== true}
                    setChecked={(value) => {
                      setScrollCursor(0)
                      setDeselectedFipTypes((prev) => ({ ...prev, [fipType]: !value }))
                    }}
                    showOnly={true}
                    selectOnly={() => {
                      setScrollCursor(0)
                      setDeselectedFipTypes(() =>
                        Object.fromEntries(allFipTypes.map((key) => [key, key !== fipType])),
                      )
                    }}
                  >
                    {fipType}
                  </ClickableChecklistItem>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <RadixButton variant="surface">
              <TbAdjustmentsHorizontal style={{ color: "var(--accent-a11)" }} />
              Display
            </RadixButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Label>
              Sort by&nbsp;
              <Select.Root
                defaultValue={sortBy || "fip_number_desc"}
                value={sortBy}
                onValueChange={(v) =>
                  setSortBy(v as "asc" | "desc" | "fip_number_asc" | "fip_number_desc")
                }
              >
                <Select.Trigger />
                <Select.Content>
                  <Select.Group>
                    <Select.Item value="fip_number_desc">FIP number descending</Select.Item>
                    <Select.Item value="fip_number_asc">FIP number ascending</Select.Item>
                    <Select.Item value="desc">Newest to Oldest</Select.Item>
                    <Select.Item value="asc">Oldest to Newest</Select.Item>
                  </Select.Group>
                </Select.Content>
              </Select.Root>
            </DropdownMenu.Label>
            <DropdownMenu.Separator />
            <DropdownMenu.Label>Show / Hide</DropdownMenu.Label>
            <ClickableChecklistItem checked={showType} setChecked={setShowType}>
              Type
            </ClickableChecklistItem>
            <ClickableChecklistItem checked={showCategory} setChecked={setShowCategory}>
              Category
            </ClickableChecklistItem>
            <ClickableChecklistItem checked={showCreationDate} setChecked={setShowCreationDate}>
              Creation Date
            </ClickableChecklistItem>
            <ClickableChecklistItem checked={showAuthors} setChecked={setShowAuthors}>
              Authors
            </ClickableChecklistItem>
            <DropdownMenu.Separator />
            <DropdownMenu.Label
              onClick={(e) => {
                e.preventDefault()
              }}
            >
              <RadixButton color="gray" variant="ghost" onClick={resetDisplayOptions}>
                Reset
              </RadixButton>
              <Box sx={{ flexGrow: "1" }}></Box>
              <RadixButton variant="ghost" onClick={saveDisplayOptions}>
                Save as default
              </RadixButton>
            </DropdownMenu.Label>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Flex>
      <Flex sx={{ flexDirection: "column", gap: [2] }}>
        {displayedFips.map((conversation) => (
          <FipEntry
            key={conversation.id}
            conversation={conversation}
            showAuthors={showAuthors}
            showCategory={showCategory}
            showCreationDate={showCreationDate}
            showType={showType}
          />
        ))}
      </Flex>
      <Box top="-20px"><IsVisibleObserver callback={() => setScrollCursor((oldValue) => oldValue + scrollPageSize)}/></Box>
    </Flex>
  )
}

export default FipTracker
