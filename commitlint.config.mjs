/**
 * Conventional Commits enforcement for the repo root.
 *
 * `type-enum` is the list documented in AGENTS.md — keep the two in sync;
 * the docs are the source of truth for what a contributor is told, this file is what
 * actually rejects a message.
 *
 * `wip` and `specs` are project-specific additions on top of config-conventional.
 * `revert` and `style` from the upstream preset are deliberately NOT allowed here,
 * so `git revert` will need its auto-generated message rewritten as `fix:` or `chore:`.
 *
 * Length rules (header/body/footer ≤ 100 chars per line) come from config-conventional
 * defaults and already match what the docs promise — do not restate them here.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['wip', 'feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'perf', 'specs', 'build', 'ci'],
    ],
  },
};
