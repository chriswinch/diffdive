#!/usr/bin/env node

import dotenv from "dotenv";
import { exec } from "child_process";
import axios, { AxiosError } from "axios";
import chalk from "chalk";

dotenv.config();

function runCommand(command: string) {
  return new Promise<string>((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(chalk.red(`Error running command: ${command}`), error);
        reject(error);
      } else if (stderr) {
        console.error(
          chalk.red(`Command resulted in stderr: ${command}`),
          stderr
        );
        reject(new Error(stderr));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

async function getDefaultBranch() {
  try {
    return await runCommand(
      "git remote show origin | grep 'HEAD branch' | cut -d' ' -f5"
    );
  } catch (error) {
    console.error(chalk.red("Failed to get default branch"), error);
    throw error;
  }
}

async function getCurrentBranch() {
  try {
    return await runCommand("git rev-parse --abbrev-ref HEAD");
  } catch (error) {
    console.error(chalk.red("Failed to get current branch"), error);
    throw error;
  }
}

async function getDiff(defaultBranch: string, currentBranch: string) {
  try {
    const sameBranch = defaultBranch.trim() === currentBranch.trim();
    const command = sameBranch ? `git diff` : `git diff ${currentBranch.trim()}...${defaultBranch.trim()}`;
    const diff = await runCommand(command);
    if (!diff) {
      console.log(chalk.red("No changes to review\n"));
    }
    return diff || "";
  } catch (error) {
    console.error(chalk.red("Failed to get diff"), error);
    throw error;
  }
}

async function getCodeReview(diff: string, model = "gpt-4") {
  try {
    console.log(chalk.yellow(diff));
    console.log(chalk.green("Getting code review..."));

    const content = `${diff}
    Give me a code review based on the git diff above. Be as critical as possible. Format your review as follows (JSON):
    const section = {
        "score": 0-10,
        "feedback: "",
        "suggestions: []
    }
    {
      "title: "",
      "description": "",
      "suggested pr title": "",
      "code quality": section,
      "readability": section,
      "maintainability": section,
      "performance": section,
      "security": section,
      "accessibility": section,
    }
    `;

    const { data } = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model,
        messages: [{ role: "user", content }],
      },
      {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      }
    );

    return data.choices[0].message.content;
  } catch (error) {
    if (error instanceof AxiosError) {
      console.error(chalk.red("Failed to get code review"), error.response?.data.error);
    } else {
      console.error(chalk.red("Failed to get code review"), error);
    }
    throw error;
  }
}

async function main() {
  const isGitRepo = await runCommand("git rev-parse --is-inside-work-tree");

  if (isGitRepo !== "true") {
    throw new Error("Not a git repository");
  }

  const defaultBranch = await getDefaultBranch();
  const currentBranch = await getCurrentBranch();
  const diff = await getDiff(defaultBranch, currentBranch);
  if (diff) {
    const codeReview = await getCodeReview(diff);
    console.log(chalk.redBright(codeReview));
  }
}

main().catch((error) => {
  console.error(chalk.red("oops, something went wrong!"), error.message);
});
