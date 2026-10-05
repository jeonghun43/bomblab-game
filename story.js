// Stories are authored in scripts/*.md (the source of truth) and parsed at load time.
// To change dialogue, tasks or quizzes, edit the markdown, not this file.
import { parseScript } from './scriptmd.js';

export const STORY_FILES = ['defuse'];

async function load(id) {
  const res = await fetch(new URL(`./scripts/${id}.md`, import.meta.url));
  if (!res.ok) throw new Error(`대본 파일을 읽지 못했습니다: scripts/${id}.md (${res.status})`);
  return parseScript(await res.text());
}

export const STORIES = Object.fromEntries(
  (await Promise.all(STORY_FILES.map(load))).map((s) => [s.id, s]),
);
