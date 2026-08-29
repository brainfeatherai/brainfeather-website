import assert from 'node:assert/strict';
import test from 'node:test';
import { extractEntities } from './entities.ts';

function entities(content: string): string[] {
  return extractEntities(content)
    .map(({ name, type }) => `${type}:${name}`)
    .sort();
}

test('keeps canonical technology extraction and aliases', () => {
  assert.deepEqual(entities('We use Next.js, TS, Postgres and Playwright.'), [
    'language:typescript',
    'tool:nextjs',
    'tool:playwright',
    'tool:postgres',
  ]);
});

test('canonicalizes Apple development tooling aliases', () => {
  assert.deepEqual(entities('The app uses Xcode, SwiftUI, and UIKit.'), [
    'tool:swiftui',
    'tool:uikit',
    'tool:xcode',
  ]);
  assert.deepEqual(entities('Built with X Code, Swift UI, and UI Kit.'), [
    'tool:swiftui',
    'tool:uikit',
    'tool:xcode',
  ]);
});

test('extracts Xcode from OpenCode-style stack facts without inventing Node.js', () => {
  assert.deepEqual(entities('Node-based app with Xcode'), ['tool:xcode']);
  assert.deepEqual(entities('This is a node-based app built with Xcode.'), ['tool:xcode']);
  assert.deepEqual(entities('The Brainfeather MCP project runs on Node.js.'), [
    'project:brainfeather mcp',
    'tool:nodejs',
  ]);
  assert.deepEqual(entities('This project uses Node for the backend.'), ['tool:nodejs']);
});

test('does not turn ordinary project prose into a named project', () => {
  assert.deepEqual(entities('This project uses React and the next step is deployment.'), [
    'tool:react',
  ]);
  assert.deepEqual(entities('Go ahead with the next solid step and let the spring fly.'), []);
});

test('keeps ambiguous technologies when a nearby technical cue is explicit', () => {
  assert.deepEqual(entities('The backend is written in Go and deployed to Fly.'), [
    'language:go',
    'tool:fly',
  ]);
  assert.deepEqual(entities('We use Next for the frontend and Rust for the service.'), [
    'language:rust',
    'tool:nextjs',
  ]);
});

test('extracts explicitly named projects', () => {
  assert.deepEqual(entities('Project: Brainfeather uses Next.js.'), [
    'project:brainfeather',
    'tool:nextjs',
  ]);
  assert.deepEqual(entities('Project: "Brainfeather Website" uses Next.js.'), [
    'project:brainfeather website',
    'tool:nextjs',
  ]);
  assert.deepEqual(entities('The Brainfeather MCP project runs on Node.js.'), [
    'project:brainfeather mcp',
    'tool:nodejs',
  ]);
});

test('extracts repositories from labels and GitHub URLs', () => {
  assert.deepEqual(
    entities(
      'Repository brainfeatherai/brainfeather-mcp mirrors https://github.com/acme/platform.git.',
    ),
    ['project:acme/platform', 'project:brainfeatherai/brainfeather-mcp'],
  );
});

test('extracts people only behind explicit role labels', () => {
  assert.deepEqual(entities('Maintainer: Ada Lovelace. Contact: @devadiga.'), [
    'person:@devadiga',
    'person:ada lovelace',
  ]);
  assert.deepEqual(entities('Ada Lovelace reviewed the design.'), []);
});

test('extracts curated architectural patterns without generic guessing', () => {
  assert.deepEqual(
    entities('Architecture: event sourcing with CQRS and a transactional outbox pattern.'),
    ['pattern:cqrs', 'pattern:event sourcing', 'pattern:transactional outbox'],
  );
  assert.deepEqual(entities('The saga continues in the next chapter.'), []);
});

test('deduplicates aliases and repeated explicit names', () => {
  assert.deepEqual(
    entities('Project: Brainfeather. The Brainfeather project uses TypeScript and TS.'),
    ['language:typescript', 'project:brainfeather'],
  );
});
