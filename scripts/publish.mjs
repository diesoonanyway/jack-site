import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const collections = ['writing', 'podcast', 'youtube', 'apps'];
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const publishedRoot = path.join(projectRoot, 'src', 'content');
const sourceRoot = path.resolve(
  process.env.JACK_CONTENT_PATH || path.join(os.homedir(), 'My Drive', 'Jack Content'),
);
const dryRun = process.argv.slice(2).includes('--dry-run');

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function isPublishedPath(value) {
  const normalized = toPosix(value).replace(/^\.\//, '');
  return normalized === 'src/content' || normalized.startsWith('src/content/');
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function run(command, args, { capture = false, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      shell: false,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });

    let stdout = '';
    let stderr = '';

    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      const result = { code: code ?? 1, stdout, stderr };
      if (result.code !== 0 && !allowFailure) {
        const detail = stderr.trim() || stdout.trim() || `exit code ${result.code}`;
        reject(new Error(`${command} ${args.join(' ')} failed: ${detail}`));
        return;
      }
      resolve(result);
    });
  });
}

async function listIndexFiles(root) {
  const results = [];

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase() === 'index.md') {
        results.push(fullPath);
      }
    }
  }

  if (await pathExists(root)) {
    await visit(root);
  }

  return results.sort((a, b) => a.localeCompare(b));
}

function parseDraft(markdown) {
  const normalized = markdown.replace(/^\uFEFF/, '');
  const frontmatter = /^---[\t ]*\r?\n([\s\S]*?)\r?\n---[\t ]*(?:\r?\n|$)/.exec(normalized);

  if (!frontmatter) {
    return { publish: false, reason: 'frontmatter 없음 또는 경계가 올바르지 않음' };
  }

  try {
    const data = yaml.load(frontmatter[1]);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { publish: false, reason: 'frontmatter가 객체가 아님' };
    }
    if (data.draft === false) {
      return { publish: true, reason: 'draft: false' };
    }
    if (!Object.hasOwn(data, 'draft')) {
      return { publish: false, reason: 'draft 필드 없음' };
    }
    if (data.draft === true) {
      return { publish: false, reason: 'draft: true' };
    }
    return { publish: false, reason: `draft가 boolean이 아님 (${typeof data.draft})` };
  } catch (error) {
    return { publish: false, reason: `YAML 오류: ${error.message}` };
  }
}

async function inspectSource() {
  if (!(await pathExists(sourceRoot))) {
    throw new Error(`Google Drive Jack Content Vault를 찾을 수 없습니다: ${sourceRoot}`);
  }

  const sourceStat = await fs.stat(sourceRoot);
  if (!sourceStat.isDirectory()) {
    throw new Error(`publish source가 폴더가 아닙니다: ${sourceRoot}`);
  }

  const result = new Map();

  for (const collection of collections) {
    const collectionRoot = path.join(sourceRoot, collection);
    if (!(await pathExists(collectionRoot))) {
      throw new Error(`필수 collection 폴더가 없습니다: ${collectionRoot}`);
    }

    const items = [];
    const indexFiles = await listIndexFiles(collectionRoot);

    for (const indexFile of indexFiles) {
      const itemDirectory = path.dirname(indexFile);
      const slug = toPosix(path.relative(collectionRoot, itemDirectory));
      if (!slug || slug === '.') {
        items.push({
          collection,
          slug: '<collection-root>',
          directory: itemDirectory,
          indexFile,
          publish: false,
          reason: '콘텐츠 폴더 없이 collection 루트에 index.md가 있음',
        });
        continue;
      }

      const markdown = await fs.readFile(indexFile, 'utf8');
      const decision = parseDraft(markdown);
      items.push({ collection, slug, directory: itemDirectory, indexFile, ...decision });
    }

    const publishedSlugs = items.filter((item) => item.publish).map((item) => item.slug);
    for (const slug of publishedSlugs) {
      const nested = publishedSlugs.find(
        (candidate) => candidate !== slug && candidate.startsWith(`${slug}/`),
      );
      if (nested) {
        throw new Error(
          `${collection}에 중첩된 콘텐츠 폴더가 있습니다: ${slug} / ${nested}. 안전을 위해 중단합니다.`,
        );
      }
    }

    result.set(collection, items);
  }

  return result;
}

async function listFiles(root) {
  const results = [];

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      } else if (entry.isSymbolicLink()) {
        results.push(fullPath);
      }
    }
  }

  if (await pathExists(root)) {
    await visit(root);
  }

  return results.sort((a, b) => a.localeCompare(b));
}

async function directoryFingerprint(root) {
  const hash = createHash('sha256');
  const files = await listFiles(root);

  for (const file of files) {
    const relative = toPosix(path.relative(root, file));
    const stat = await fs.lstat(file);
    hash.update(relative);
    hash.update('\0');
    if (stat.isSymbolicLink()) {
      hash.update(`link:${await fs.readlink(file)}`);
    } else {
      hash.update(await fs.readFile(file));
    }
    hash.update('\0');
  }

  return hash.digest('hex');
}

async function inspectCurrentPublished() {
  const result = new Map();

  for (const collection of collections) {
    const collectionRoot = path.join(publishedRoot, collection);
    const items = new Map();
    for (const indexFile of await listIndexFiles(collectionRoot)) {
      const directory = path.dirname(indexFile);
      const slug = toPosix(path.relative(collectionRoot, directory));
      if (slug && slug !== '.') {
        items.set(slug, directory);
      }
    }
    result.set(collection, items);
  }

  return result;
}

async function calculateChanges(sourceInspection, currentPublished) {
  const changes = new Map();

  for (const collection of collections) {
    const sourceItems = sourceInspection.get(collection);
    const intended = new Map(
      sourceItems.filter((item) => item.publish).map((item) => [item.slug, item.directory]),
    );
    const current = currentPublished.get(collection);
    const added = [];
    const deleted = [];
    const updated = [];
    const unchanged = [];

    for (const [slug, directory] of intended) {
      if (!current.has(slug)) {
        added.push(slug);
        continue;
      }
      const [sourceHash, currentHash] = await Promise.all([
        directoryFingerprint(directory),
        directoryFingerprint(current.get(slug)),
      ]);
      (sourceHash === currentHash ? unchanged : updated).push(slug);
    }

    for (const slug of current.keys()) {
      if (!intended.has(slug)) {
        deleted.push(slug);
      }
    }

    changes.set(collection, { added, deleted, updated, unchanged });
  }

  return changes;
}

async function getNonCollectionEntries() {
  if (!(await pathExists(publishedRoot))) {
    return [];
  }
  const entries = await fs.readdir(publishedRoot, { withFileTypes: true });
  return entries
    .filter((entry) => !collections.includes(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function printList(label, values) {
  console.log(`${label}: ${values.length}`);
  for (const value of values) {
    console.log(`  - ${value}`);
  }
}

async function getGitStatus() {
  const result = await run('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    capture: true,
  });
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({ status: line.slice(0, 2), path: line.slice(3) }));
}

function printInspection(sourceInspection, changes, nonCollectionEntries) {
  console.log(dryRun ? 'Jack Content publish dry-run' : 'Jack Content publish');
  console.log(`Source: ${sourceRoot}`);
  console.log(`Destination: ${publishedRoot}`);
  console.log('');

  let totalFound = 0;
  let totalPublished = 0;
  let totalExcluded = 0;

  for (const collection of collections) {
    const items = sourceInspection.get(collection);
    const published = items.filter((item) => item.publish);
    const excluded = items.filter((item) => !item.publish);
    totalFound += items.length;
    totalPublished += published.length;
    totalExcluded += excluded.length;

    console.log(
      `${collection}: 발견 ${items.length}, 발행 대상 ${published.length}, 제외 ${excluded.length}`,
    );
    for (const item of excluded) {
      console.log(`  제외: ${item.slug} — ${item.reason}`);
    }

    const collectionChanges = changes.get(collection);
    printList('  추가', collectionChanges.added);
    printList('  삭제', collectionChanges.deleted);
    printList('  업데이트', collectionChanges.updated);
    console.log(`  변경 없음: ${collectionChanges.unchanged.length}`);
    console.log('');
  }

  console.log(
    `전체: 발견 ${totalFound}, 발행 대상 ${totalPublished}, draft/오류로 제외 ${totalExcluded}`,
  );
  printList('발행본에서 제거될 비-collection 항목', nonCollectionEntries);
}

async function createStaging(sourceInspection, stagingRoot) {
  await fs.mkdir(stagingRoot, { recursive: false });

  for (const collection of collections) {
    const collectionStage = path.join(stagingRoot, collection);
    await fs.mkdir(collectionStage, { recursive: true });

    for (const item of sourceInspection.get(collection).filter((entry) => entry.publish)) {
      const target = path.join(collectionStage, ...item.slug.split('/'));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.cp(item.directory, target, {
        recursive: true,
        force: false,
        errorOnExist: true,
        preserveTimestamps: true,
      });
    }
  }
}

async function restorePublished(backupRoot) {
  if (await pathExists(publishedRoot)) {
    await fs.rm(publishedRoot, { recursive: true, force: true });
  }
  await fs.rename(backupRoot, publishedRoot);
}

async function askToPublish() {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const answer = (
        await prompt.question(
          '\nBuild succeeded.\n\nReady to publish to GitHub and Cloudflare.\n\nPublish now? (Y/N) ',
        )
      )
        .trim()
        .toLowerCase();
      if (answer === 'y') return true;
      if (answer === 'n') return false;
      console.log('Y 또는 N을 입력해 주세요.');
    }
  } finally {
    prompt.close();
  }
}

async function main() {
  const sourceInspection = await inspectSource();
  const currentPublished = await inspectCurrentPublished();
  const changes = await calculateChanges(sourceInspection, currentPublished);
  const nonCollectionEntries = await getNonCollectionEntries();
  printInspection(sourceInspection, changes, nonCollectionEntries);

  const gitStatus = await getGitStatus();
  const outsideContentChanges = gitStatus.filter((entry) => {
    const paths = entry.path.includes(' -> ') ? entry.path.split(' -> ') : [entry.path];
    return paths.some((entryPath) => !isPublishedPath(entryPath.replace(/^"|"$/g, '')));
  });

  if (dryRun) {
    if (outsideContentChanges.length > 0) {
      console.log('\n주의: 실제 publish라면 다음 비-content 변경 때문에 시작 전에 중단됩니다.');
      for (const entry of outsideContentChanges) {
        console.log(`  ${entry.status} ${entry.path}`);
      }
    }
    console.log('\nDry-run 완료: src/content, Git, Google Drive 원본을 변경하지 않았습니다.');
    return;
  }

  if (outsideContentChanges.length > 0) {
    console.error('\n콘텐츠 외의 uncommitted change가 있어 publish를 중단합니다:');
    for (const entry of outsideContentChanges) {
      console.error(`  ${entry.status} ${entry.path}`);
    }
    process.exitCode = 1;
    return;
  }

  const stagedBeforePublish = gitStatus.filter((entry) => entry.status[0] !== ' ' && entry.status[0] !== '?');
  if (stagedBeforePublish.length > 0) {
    console.error('\n이미 stage된 변경이 있어 Git index 보호를 위해 publish를 중단합니다.');
    process.exitCode = 1;
    return;
  }

  const token = `${Date.now()}-${process.pid}`;
  const stagingRoot = path.join(projectRoot, 'src', `.content-publish-stage-${token}`);
  const backupRoot = path.join(projectRoot, 'src', `.content-publish-backup-${token}`);
  let swapped = false;
  let committed = false;

  try {
    await createStaging(sourceInspection, stagingRoot);
    await fs.rename(publishedRoot, backupRoot);
    await fs.rename(stagingRoot, publishedRoot);
    swapped = true;

    if (!process.env.npm_execpath) {
      throw new Error('npm 실행 경로를 확인할 수 없습니다. npm run publish로 실행해 주세요.');
    }
    const build = await run(
      process.execPath,
      [process.env.npm_execpath, 'run', 'build', '--', '--force'],
      { allowFailure: true },
    );
    if (build.code !== 0) {
      await restorePublished(backupRoot);
      swapped = false;
      console.error('\n빌드 실패 — 기존 발행 상태로 복원했습니다.');
      process.exitCode = build.code;
      return;
    }

    if (!(await askToPublish())) {
      await restorePublished(backupRoot);
      swapped = false;
      console.log('\nPublish를 취소했습니다. 기존 발행 상태로 복원했습니다.');
      return;
    }

    await run('git', ['add', '-A', '--', 'src/content']);
    const staged = await run('git', ['diff', '--cached', '--name-only'], { capture: true });
    const stagedPaths = staged.stdout.split(/\r?\n/).filter(Boolean);
    const unsafeStagedPaths = stagedPaths.filter((entry) => !isPublishedPath(entry));
    if (unsafeStagedPaths.length > 0) {
      throw new Error(`src/content 밖의 파일이 stage됐습니다: ${unsafeStagedPaths.join(', ')}`);
    }

    if (stagedPaths.length === 0) {
      await fs.rm(backupRoot, { recursive: true, force: true });
      swapped = false;
      console.log('\n발행 콘텐츠 변경이 없어 commit과 push를 실행하지 않았습니다.');
      return;
    }

    const date = new Date().toLocaleDateString('en-CA');
    await run('git', ['commit', '-m', `Publish content ${date}`, '--', 'src/content']);
    committed = true;
    await fs.rm(backupRoot, { recursive: true, force: true });
    swapped = false;

    const push = await run('git', ['push'], { allowFailure: true });
    if (push.code !== 0) {
      console.error('\n콘텐츠는 로컬 Git commit까지 완료되었지만 push에 실패했습니다.');
      console.error('Git history를 변경하거나 자동 재시도하지 않았습니다.');
      process.exitCode = push.code;
      return;
    }

    console.log('\n콘텐츠 commit과 GitHub push가 완료되었습니다.');
    console.log('Cloudflare 배포는 기존 Git 연동이 처리합니다.');
  } catch (error) {
    if (!committed) {
      await run('git', ['restore', '--staged', '--', 'src/content'], {
        allowFailure: true,
      });
    }
    if (swapped && (await pathExists(backupRoot))) {
      await restorePublished(backupRoot);
      swapped = false;
      console.error('\n오류가 발생해 기존 src/content를 복원했습니다.');
    }
    if (await pathExists(stagingRoot)) {
      await fs.rm(stagingRoot, { recursive: true, force: true });
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(`\nPublish 실패: ${error.message}`);
  process.exitCode = 1;
});
