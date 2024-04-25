/** @jsx jsx */

import React, { useState } from "react"
import { Box, Button, Text, jsx } from "theme-ui"
import { TbExternalLink } from "react-icons/tb"
import { surveyBox } from "./index"
import SurveyCard from "./survey_card"

const SurveyCards = ({
  conversation_id,
  votedComments,
  unvotedComments,
  onVoted,
  goTo,
  zid_metadata,
  user,
}: {
  conversation_id
  votedComments
  unvotedComments
  onVoted
  goTo
  zid_metadata
  user
}) => {
  // className={collapsed ? "react-markdown css-fade" : "react-markdown"}
  const [collapsed, setCollapsed] = useState(true)

  return (
    <Box sx={{ position: "relative" }}>
      {unvotedComments.length > 0 && (
        <Box
          className={collapsed && unvotedComments.length > 2 ? "css-fade-more" : ""}
          sx={collapsed ? { maxHeight: "420px", overflow: "hidden" } : {}}
        >
          {unvotedComments.map((comment, index) => (
            <Box
              key={comment.tid}
              sx={{
                mb: "12px",
                transition: "0.2s ease-in-out",
              }}
            >
              <SurveyCard
                user={user}
                comment={comment}
                conversationId={conversation_id}
                onVoted={onVoted}
                hasVoted={false}
                zid_metadata={zid_metadata}
              />
            </Box>
          ))}
        </Box>
      )}
      {unvotedComments.length > 2 && (
        <Text
          as="div"
          sx={{ textAlign: "center", fontWeight: 600, width: "100%", mt: "16px", mb: "10px" }}
          variant="links.a"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed
            ? `Show more comments (${unvotedComments.length} total)`
            : "Show fewer comments"}
        </Text>
      )}
      {unvotedComments.length === 0 && votedComments.length === 0 && (
        <Box sx={{ ...surveyBox, padding: "50px 32px", fontWeight: 500, fontSize: "0.94em" }}>
          No comments on this poll yet.
        </Box>
      )}
      {unvotedComments.length === 0 && votedComments.length !== 0 && (
        <React.Fragment>
          <Box
            sx={{
              ...surveyBox,
              bg: "bgWhite",
              padding: "50px 32px",
              fontWeight: 500,
              fontSize: "0.94em",
            }}
          >
            You’ve voted on all {votedComments.length} responses so far.
            <br />
            Come back later for more to vote on, or add your own.
          </Box>
          {(zid_metadata.postsurvey || zid_metadata.postsurvey_redirect) && (
            <Button
              variant="primary"
              onClick={() =>
                zid_metadata.postsurvey
                  ? goTo("postsurvey")
                  : window.open(zid_metadata.postsurvey_redirect)
              }
              sx={{ width: "100%", mb: [3] }}
            >
              Go to next steps
              {!zid_metadata.postsurvey && (
                <TbExternalLink style={{ marginLeft: "5px", position: "relative", top: "2px" }} />
              )}
            </Button>
          )}
        </React.Fragment>
      )}
    </Box>
  )
}

export default SurveyCards
