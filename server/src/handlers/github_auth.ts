import { Response } from "express";
import { Octokit } from "@octokit/core";
import { createOAuthUserAuth } from "@octokit/auth-oauth-user";

import { startSession } from "../session";
import cookies from "../utils/cookies";
import fail from "../utils/fail";
import { getOrCreateUserWithGithubUsername } from "./queries";


export function handle_GET_github_init(
  req: { p: { dest: string; owner: string } },
  res: { redirect: (arg0: string) => void }
){
  let dest = req.p.dest
  const clientId = process.env.GH_APP_CLIENT_ID;
  const redirectUrl = `https://github.com/login/oauth/authorize?scope=user:email&client_id=${clientId}&dest=${dest}`;

  res.redirect(redirectUrl);
}

export function handle_GET_github_oauth_callback(
  req: { p: { uid?: any; code: any; dest?: any } },
  res: any // { redirect: (arg0: any) => void }
) {
  handleGithubOauthCallback(req, res).catch((err) => {
    fail(res, 500, err.message);
  })
}

async function handleGithubOauthCallback(req: { p: {uid?: any; code: string; dest?: any} }, res: Response) {
  const octokit = new Octokit({
    authStrategy: createOAuthUserAuth,
    auth: {
      clientId: process.env.GH_APP_CLIENT_ID,
      clientSecret: process.env.GH_APP_CLIENT_SECRET,
      code: req.p.code,
    },
  });

  // get the github user that is associated with the token
  const {
    data: { login },
  } = await octokit.request("GET /user");

  const githubUsername = login;
  if(!githubUsername) {
    throw Error("invalid github access token");
  }

  const {uid} = await getOrCreateUserWithGithubUsername(githubUsername);

  const token = await startSession(uid);

  try {
    await cookies.addCookies(req as any, res, token, uid);
  } catch (err) {
    return fail(res, 500, "polis_err_adding_cookies", err);
  }

  const dest = req.p.dest || "http://localhost:8080";
  res.redirect(dest);
}
