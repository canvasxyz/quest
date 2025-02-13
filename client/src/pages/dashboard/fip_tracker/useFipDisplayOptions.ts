import { useState } from "react"
import { toast } from "react-hot-toast"
import { useLocalStorage } from "usehooks-ts"

export const useFipDisplayOptions = () => {
  const [savedDisplayOptions, setSavedDisplayOptions] = useLocalStorage(
    "fipTrackerDisplayOptions",
    JSON.stringify({
      showAuthors: true,
      showCreationDate: true,
      showType: true,
      showCategory: true,
      sortBy: "fip_number_desc",
    }),
  )
  const initialSavedDisplayOptions = JSON.parse(savedDisplayOptions)
  const [showAuthors, setShowAuthors] = useState(initialSavedDisplayOptions.showAuthors)
  const [showCreationDate, setShowCreationDate] = useState(
    initialSavedDisplayOptions.showCreationDate,
  )
  const [showType, setShowType] = useState(initialSavedDisplayOptions.showType)
  const [showCategory, setShowCategory] = useState(initialSavedDisplayOptions.showCategory)

  const [sortBy, setSortBy] = useState<"desc" | "asc" | "fip_number_asc" | "fip_number_desc">(
    initialSavedDisplayOptions.sortBy,
  )

  const resetDisplayOptions = () => {
    toast.success("Reset saved display options for FIP Tracker")
    setShowAuthors(initialSavedDisplayOptions.showAuthors)
    setShowCategory(initialSavedDisplayOptions.showCategory)
    setShowCreationDate(initialSavedDisplayOptions.showCreationDate)
    setShowType(initialSavedDisplayOptions.showType)
    setSortBy(initialSavedDisplayOptions.sortBy)
  }

  const saveDisplayOptions = () => {
    toast.success("Saved display options for FIP Tracker")
    setSavedDisplayOptions(
      JSON.stringify({ showAuthors, showCategory, showCreationDate, showType, sortBy }),
    )
  }

  return {
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
  }
}
