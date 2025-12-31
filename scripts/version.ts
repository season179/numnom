import { $ } from 'bun';

const PACKAGE_JSON = 'package.json';
const MANIFEST_JSON = 'public/manifest.json';

async function readJson(path: string): Promise<Record<string, unknown>> {
  const file = Bun.file(path);
  return await file.json();
}

async function writeJson(path: string, data: Record<string, unknown>): Promise<void> {
  const content = `${JSON.stringify(data, null, 2)}\n`;
  await Bun.write(path, content);
}

function calculateNewVersion(currentVersion: string): string {
  const now = new Date();
  const year = now.getFullYear() % 100; // 2-digit year
  const month = now.getMonth() + 1; // 1-indexed month

  const [curYear, curMonth, curPatch] = currentVersion.split('.').map(Number);

  let newPatch: number;
  if (curYear === year && curMonth === month) {
    // Same month: increment patch
    newPatch = curPatch + 1;
  } else {
    // Different month: reset to 1
    newPatch = 1;
  }

  return `${year}.${month}.${newPatch}`;
}

async function main(): Promise<void> {
  // Read current version
  const pkg = await readJson(PACKAGE_JSON);
  const currentVersion = pkg.version as string;

  // Calculate new version
  const newVersion = calculateNewVersion(currentVersion);

  console.log(`${currentVersion} → ${newVersion}`);

  // Update package.json
  pkg.version = newVersion;
  await writeJson(PACKAGE_JSON, pkg);

  // Update manifest.json
  const manifest = await readJson(MANIFEST_JSON);
  manifest.version = newVersion;
  await writeJson(MANIFEST_JSON, manifest);

  // Git commit and tag
  await $`git add ${PACKAGE_JSON} ${MANIFEST_JSON}`;
  await $`git commit -m ${`chore: release v${newVersion}`}`;
  await $`git tag ${`v${newVersion}`}`;

  console.log(`Tagged v${newVersion}`);
}

main();
