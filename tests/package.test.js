import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { buildXpi } from "../scripts/build-xpi.mjs";
import { readZip } from "../scripts/zip.mjs";

function build() {
  const dir = mkdtempSync(join(tmpdir(), "isemailspam-xpi-"));
  try {
    return readZip(readFileSync(buildXpi(join(dir, "isemailspam.xpi"))));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const files = build();
const manifest = JSON.parse(files.get("manifest.json").toString("utf8"));

function resolveRef(from, ref) {
  return posix.normalize(posix.join(posix.dirname(from), ref));
}

test("XPI is a valid ZIP with manifest.json at the root", () => {
  assert.ok(files.has("manifest.json"));
  assert.equal(manifest.manifest_version, 3);
});

test("manifest-referenced assets are included", () => {
  const refs = [
    ...manifest.background.scripts,
    manifest.message_display_action.default_popup,
    manifest.message_display_action.default_icon,
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
  ];
  for (const ref of refs) assert.ok(files.has(ref), `missing ${ref}`);
});

test("HTML and JS references resolve inside the package", () => {
  for (const [name, data] of files) {
    const text = data.toString("utf8");
    let refs = [];
    if (name.endsWith(".html")) {
      refs = [...text.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
        .filter((r) => !/^https?:/.test(r));
    } else if (name.endsWith(".js")) {
      refs = [...text.matchAll(/^\s*(?:import|export)[^"']*["'](\.[^"']+)["']/gm)].map((m) => m[1]);
    }
    for (const ref of refs) {
      assert.ok(files.has(resolveRef(name, ref)), `${name} references missing ${ref}`);
    }
  }
});

test("LICENSE and PNG icons are packaged", () => {
  assert.ok(files.has("LICENSE"));
  assert.ok(Object.values(manifest.icons).every((p) => p.endsWith(".png")));
  assert.ok(manifest.icons["128"], "128px icon for the add-on listing");
});

test("development artifacts and secrets are excluded", () => {
  for (const name of files.keys()) {
    assert.doesNotMatch(name, /^(tests|scripts|dist|node_modules|listing)\/|^\.|package\.json|\.md$/);
  }
  for (const data of files.values()) {
    assert.ok(!data.toString("utf8").includes("test-key-SECRET"));
  }
});

test("permissions stay narrowly scoped", () => {
  assert.deepEqual(manifest.permissions.toSorted(), ["messagesRead", "storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://isemailspam.com/*"]);
  assert.equal(manifest.optional_permissions, undefined);
  assert.equal(manifest.experiment_apis, undefined);
  assert.equal(manifest.content_scripts, undefined);
});

test("manifest declares gecko id and minimum version", () => {
  assert.match(manifest.browser_specific_settings.gecko.id, /^\{[0-9a-f-]{36}\}$/);
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, "147.0");
  assert.equal(manifest.background.service_worker, undefined);
});
