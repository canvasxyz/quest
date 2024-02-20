/** @jsx jsx */

import React, { useEffect, useState } from "react"
import { toast } from "react-hot-toast"
import { Heading, Link, Box, Flex, Text, jsx } from "theme-ui"
import { Link as RouterLink, useHistory } from "react-router-dom"

import { RootState } from "../../store"
import { useAppSelector, useAppDispatch } from "../../hooks"
import api from "../../util/api"
import { Frontmatter, Collapsible } from "../Frontmatter"
import Survey, { surveyBox } from "../survey"
import { populateZidMetadataStore } from "../../actions"
import { SentimentCheck } from "./sentiment_check"

type ReportComment = {
  active: boolean
  agree_count: number
  conversation_id: string
  count: number
  created: string
  disagree_count: number
  is_meta: boolean
  is_seed: boolean
  lang: string | null
  mod: number
  pass_count: number
  pid: number
  quote_src_url: string | null
  tid: number
  tweet_id: string | null
  txt: string
  velocity: number
}

export const DashboardConversation = ({
  selectedConversationId,
  user,
}: {
  selectedConversationId: string
  user
}) => {
  const hist = useHistory()
  const dispatch = useAppDispatch()
  const { zid_metadata, error: zidMetadataError } = useAppSelector(
    (state: RootState) => state.zid_metadata,
  )

  const [report, setReport] = useState<{ report_id: string }>()
  const [reportComments, setReportComments] = useState<ReportComment[]>([])
  const [maxCount, setMaxCount] = useState<number>(0)
  const [refreshInProgress, setRefreshInProgress] = useState(false)

  useEffect(() => {
    setReport(undefined)
    setReportComments([])
    if (!zid_metadata.conversation_id) return
    refreshReport()
  }, [zid_metadata.conversation_id])

  const generateReport = () => {
    api
      .post("/api/v3/reports", { conversation_id: zid_metadata.conversation_id })
      .then(() => refreshReport())
  }

  const refreshReport = () => {
    setRefreshInProgress(true)
    api
      .get("/api/v3/reports", { conversation_id: zid_metadata.conversation_id })
      .then((reports) => {
        setReport(reports[0])
        if (!reports[0]) return
        api
          .get("/api/v3/comments", {
            conversation_id: zid_metadata.conversation_id,
            report_id: reports[0].report_id,
            mod_gt: -1,
            moderation: true,
            include_voting_patterns: true,
          })
          .then((comments) => {
            setReportComments(comments)
            setMaxCount(
              Math.max.apply(
                this,
                comments.map((comment) => comment.count),
              ),
            )
          })
      })
      .always(() => setRefreshInProgress(false))
  }

  useEffect(() => {
    dispatch(populateZidMetadataStore(selectedConversationId))
  }, [selectedConversationId])

  useEffect(() => {
    if (zidMetadataError) {
      toast.error("Couldn't retrieve conversation")
      // redirect to main dashboard
      hist.push(`/dashboard`)
    }
  }, [zidMetadataError])

  return (
    <Box>
      <Box sx={{ width: "100%" }}>
        <Flex
          sx={{
            flexDirection: "column",
            gap: [2],
            margin: "0 auto",
            pt: [5],
            pb: [2],
            mt: [3],
            px: [5],
            maxWidth: "960px",
          }}
        >
          <Heading as="h2">
            {zid_metadata.fip_title || zid_metadata.github_pr_title || zid_metadata.topic}
          </Heading>
          {!zid_metadata.fip_title && !zid_metadata.github_pr_title && zid_metadata.topic && (
            <Text sx={{ fontSize: "0.94em" }}>
              Created by{" "}
              <Link
                variant="links.a"
                as="a"
                target="_blank"
                rel="noreferrer"
                href={`https://github.com/${zid_metadata.github_username}`}
              >
                {zid_metadata.github_username}
              </Link>
            </Text>
          )}
          {zid_metadata.fip_author ? (
            <Frontmatter zid_metadata={zid_metadata} />
          ) : (
            zid_metadata.description && (
              <Collapsible
                title={zid_metadata.fip_title}
                key={zid_metadata.conversation_id}
                shouldCollapse={zid_metadata.description?.length > 300}
                content={zid_metadata.description}
              ></Collapsible>
            )
          )}
        </Flex>
        <Box
          sx={{
            margin: "0 auto",
            maxWidth: "960px",
            px: [5],
            py: [2],
            lineHeight: 1.45,
          }}
        >
          {zid_metadata.fip_author && (
            <Box
              sx={{
                overflowX: "scroll",
                py: [3],
                px: "19px",
                mb: [4],
                lineHeight: 1.35,
                border: "1px solid #ddd",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  fontSize: "0.94em",
                  fontWeight: 700,
                }}
              >
                <Text sx={{ flex: 1 }}>Sentiment Check</Text>
              </Box>
              <Box sx={{ fontSize: "0.94em", mb: "16px" }}>
                Indicate your support or opposition to this FIP:
              </Box>
              <SentimentCheck user={user} zid_metadata={zid_metadata} />
            </Box>
          )}
          {!zid_metadata.fip_author && (zid_metadata.topic || zid_metadata.fip_title) && (
            <Box sx={{}}>
              <Box
                sx={{
                  display: "flex",
                  fontSize: "0.94em",
                  fontWeight: 700,
                }}
              >
                <Text sx={{ flex: 1 }}>Consensus Check</Text>
              </Box>
              <Box sx={{ fontSize: "0.94em", mb: "12px" }}>
                Submit comments or suggestions related to this{" "}
                {zid_metadata.fip_author ? "FIP" : "discussion"} for the community to vote on:
              </Box>
              <Survey
                key={zid_metadata.conversation_id}
                match={{
                  params: { conversation_id: zid_metadata.conversation_id },
                }}
              />
              <Box sx={{ fontWeight: 700 }}>Top Notes</Box>
              <Box>
                {!refreshInProgress && report && (
                  <Box>
                    <Text sx={{ mb: "10px", fontSize: "0.94em" }}>
                      {reportComments.length === 0 && "See a summary of how people voted on notes:"}
                    </Text>
                    {reportComments.length === 0 && (
                      <Box sx={{ ...surveyBox, padding: "70px 32px 70px", fontWeight: 500 }}>
                        No notes on this {zid_metadata.fip_author ? "FIP" : "discussion"} yet.
                      </Box>
                    )}
                  </Box>
                )}
                {!refreshInProgress &&
                  reportComments.map((c: ReportComment) => (
                    <ReportCommentRow key={c.tid} reportComment={c} maxCount={maxCount} />
                  ))}
                <Box
                  sx={{
                    fontSize: "0.9em",
                    mt: "20px",
                    color: "#9f9e9b",
                    fontWeight: 500,
                    textAlign: "center",
                  }}
                >
                  {!report && (
                    <Text as="span" variant="links.text" onClick={generateReport}>
                      Generate Report
                    </Text>
                  )}
                  {report && (
                    <RouterLink to={`/r/${zid_metadata?.conversation_id}/${report?.report_id}`}>
                      <Text as="span" variant="links.text">
                        View full report
                      </Text>
                    </RouterLink>
                  )}
                  {report && (
                    <Text as="span" variant="links.text" onClick={refreshReport} sx={{ ml: [2] }}>
                      Refresh report
                    </Text>
                  )}
                </Box>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}

const ReportCommentRow = ({
  reportComment,
  maxCount,
}: {
  reportComment: ReportComment
  maxCount: number
}) => {
  const { agree_count, disagree_count, pass_count, tid, txt } = reportComment
  const row = { display: "flex" }
  const bar = { px: "1px", py: "2px", lineHeight: 1.2 }
  const text = { display: "inline-block", fontSize: "0.88em", left: "4px" }

  return (
    <Box key={tid}>
      <Box
        sx={{
          bg: "bgOffWhite",
          border: "1px solid #e2ddd5",
          borderRadius: "7px",
          mb: [1],
          pt: "12px",
          pb: "10px",
          pl: "20px",
          pr: "15px",
          display: "flex",
        }}
      >
        <Text sx={{ margin: "auto", fontSize: "0.91em", lineHeight: 1.3, flex: 1, pr: [1] }}>
          {txt}
        </Text>
        <Box sx={{ position: "relative", pl: [3] }}>
          <Box sx={row}>
            <Box sx={{ width: 70, ...text }}>Agree</Box>
            <Box sx={{ width: 70 }}>
              <Box
                sx={{
                  width: `${Math.ceil((agree_count / maxCount) * 100)}%`,
                  bg: "#2fcc71",
                  color: agree_count / maxCount < 0.2 ? "#222" : "#fff",
                  ...bar,
                }}
              >
                <Text sx={text}>{agree_count}</Text>
              </Box>
            </Box>
          </Box>
          <Box sx={row}>
            <Box sx={{ width: 70, ...text }}>Disagree</Box>
            <Box sx={{ width: 70 }}>
              <Box
                sx={{
                  width: `${Math.ceil((disagree_count / maxCount) * 100)}%`,
                  bg: "#e74b3c",
                  color: disagree_count / maxCount < 0.2 ? "#222" : "#fff",
                  ...bar,
                }}
              >
                <Text sx={text}>{disagree_count}</Text>
              </Box>
            </Box>
          </Box>
          <Box sx={row}>
            <Box sx={{ width: 70, ...text }}>Pass</Box>
            <Box sx={{ width: 70 }}>
              <Box
                sx={{
                  width: `${Math.ceil((pass_count / maxCount) * 100)}%`,
                  bg: "#e6e6e6",
                  ...bar,
                }}
              >
                <Text sx={text}>{pass_count}</Text>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
