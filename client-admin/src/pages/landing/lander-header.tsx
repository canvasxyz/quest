/** @jsx jsx */
import { Component } from "react"
import { Flex, Box, jsx } from "theme-ui"

import { Link } from "react-router-dom"
import Logomark from "../widgets/logomark"

class Header extends Component {
  render() {
    return (
      <Box>
        <Flex
          sx={{
            margin: `0 auto`,
            width: "100%",
            paddingTop: "2rem",
            paddingBottom: "1.45rem",
            justifyContent: "space-between",
            fontFamily: "monospace",
          }}
        >
          <Box sx={{ zIndex: 1000 }}>
            <Link sx={{ variant: "links.nav" }} to="/home">
              <Logomark
                style={{ marginRight: 10, position: "relative", top: 6 }}
                fill={"#62a6ef"}
              />
              Polis
            </Link>
          </Box>
          <Box sx={{ mt: [1] }}>
            <Link sx={{ variant: "links.nav" }} to="/signin">
              Sign in
            </Link>
          </Box>
        </Flex>
      </Box>
    )
  }
}

export default Header
