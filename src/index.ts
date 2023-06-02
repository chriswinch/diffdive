#!/usr/bin/env node

import dotenv from "dotenv";
import { exec } from "child_process";
import axios from "axios";
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
    const command = `git diff ${currentBranch.trim()}...${defaultBranch.trim()}`;
    return await runCommand(command);
  } catch (error) {
    console.error(chalk.red("Failed to get diff"), error);
    throw error;
  }
}

async function getCodeReview(diff: string, model = "gpt-3.5-turbo") {
  try {
    console.log(chalk.yellow(diff));
    console.log(chalk.green("Getting code review..."));

    const content = `${diff}\nGive me a code review based on the git diff above. Be as critical as possible.`;

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
    console.error(chalk.red("Failed to get code review"), error);
    throw error;
  }
}

async function main() {
  try {
    const isGitRepo = await runCommand("git rev-parse --is-inside-work-tree");

    if (isGitRepo !== "true") {
      throw new Error("Not a git repository");
    }

    const defaultBranch = await getDefaultBranch();
    const currentBranch = await getCurrentBranch();
    const diff = await getDiff(defaultBranch, currentBranch);
    const codeReview = await getCodeReview(diff);

    console.log(chalk.redBright(codeReview));
  } catch (error) {
    console.error(chalk.red("Failed to get code review for changes"), error);
  }
}

main().catch((error) => {
  console.error(chalk.red("Failed to get code review for changes"), error);
});
