# Moderator QA

Start a **new game** when checking these fixes. Saved sessions retain their original role definitions; no saved games or custom roles have been reset.

## Setup and dealing

- Try portrait at 360–393 px wide and a desktop window. Check that all controls remain reachable and the fixed footer does not cover the final controls when scrolled down.
- Attach the packs you want. Base roles begin selected as possible; expansion roles and Spirits do not.
- Enter player names, including one long name. Choose possible roles and build an exact deck with one card per player.
- On **Deal and review**, check **Silent Night** beside **Use app to distribute roles**. Both settings should survive going Back and forward.
- Choose **Gardened allocation**. Assign a role with only one copy: it should be unavailable for other seats. Go Back, remove it from the deck, and replace it. The affected seat should return to **Shuffle this seat**, with a notice and no stale validation error.
- Review the role-tagged night order. Try both spoken calls and Silent Night in separate games.
- If distributing in the app, pass it between players. Each player should get one card, be able to read the role, and hide it with **Ready**. Gardened seats must receive the correct card.

## Moderation

- With Monk in the deck, choose at least two absent roles under **Role information** on **Deal and review**, before dealing or passing out cards. Only possible, non-Status roles outside the exact deck may be chosen. Going Back and adding a selected role to the deck must remove that choice and require a replacement. Night 0 must show the chosen names with one **Confirm** button, no role picker and no extra result page. Check random/gardened allocation, app distribution, spoken/Silent Night, reload and Undo/Redo. Games created before this change retain their original night-time choice, including a saved unfinished deal.

- Confirm Night 0 actions show whom to wake and what to do. Required choices say **Choose a target** until selected; optional actions say **Skip**.
- Play two rounds of voting. Every new tally starts at zero; the entered/expected totals and ballot candidates should agree with the visible entries. Test a single candidate, a tie, and an accepted recount mismatch.
- With Healer, skip a night with no deaths. On the following night, kill a target and verify Healer still has the revival. Repeat skip/use checks for Assassin, Thief, and Guild Master.
- With Necromancer, verify no ritual starts while either of its cursed players is alive. Once no active living Curse remains, skipping must do nothing; selecting Necromancer starts the ritual and a later eligible confirmation completes it.
- Check the terminal winners: Undertaker and qualifying Goblin share a Necromancer victory; Outcast loses only if Alpha is still alive at the actual ending; Vagrant does not bank survival on ordinary mornings; Hag alone does not prevent Village victory once Shadow creatures are gone.
- Check **Roster**, **History**, Undo/Redo, and a reasoned override. Reload and resume. After the app reports offline readiness, switch off the connection and repeat.

## Library and editor

- Role cards show team/win condition, Corrupt and Mystic only. The faction filter uses **Third Party**, not Neutral.
- Clone a role and type **Wolf Pack** into its team label, one character at a time. The space must remain.
- Export and reimport Darkest Night, Hidden Motives and Official Game. Each unchanged file should say **Already installed**, not report a checksum mismatch.
- An import with an unsupported effect nested inside a conditional or status ability must be marked unavailable with the location of the unsupported primitive.

## App updates

- When a new version is available, **Update now** appears only on the main menu. Ignore it and enter setup: your page and inputs must remain unchanged when the update finishes downloading.
- Repeat during a game or role distribution. No automatic reload or update notice should interrupt the current action.
- From another app tab, accept the update. The tab still in setup/play must not reload.
- Return to the main menu when ready and choose **Update now**. Once reloaded, resume the saved game. A fully downloaded update should work offline too.
- While **Updating…** is shown, navigation is disabled. A failed or stalled update should offer retry rather than leaving the app locked.

Update-flow validation on 3 September 2026: ten new unit/component tests and four real-worker phone/desktop browser cases cover consent, first installation, pending updates, another tab activating an update, failure recovery and offline resume.

## Automated checks

Monk preparation validation on 3 September 2026: production build and all 162 unit/integration tests passed; 29 phone/desktop browser tests passed, with five deliberate viewport-specific skips. New tests cover validation and deck changes, random/gardened allocation, card distribution, Night 0 instructions, cloned role round-tripping, undo/redo, replay, older saves and offline resume. Phone and desktop screenshots were reviewed. The browser plugin could not initialise; verification used the repository's Playwright suite with isolated storage.

Validation on 2 September 2026: production build passed; 135 TypeScript tests passed; 21 browser tests passed with five deliberate viewport-specific skips. The provider-free Python base-rules checks, 67 webapp/budget/context tests, and model-evaluation dry run also passed. No paid model calls were made. Screenshots were reviewed at phone and desktop widths; the interactive Codex browser driver was unavailable, so browser verification used the repository's Playwright suite.

The repository includes `src/test/moderator-regressions.test.tsx` and `e2e/moderator-qa.spec.ts`. Run `npm test -- --run`, `npm run build`, and `npm run test:e2e`. Browser tests use isolated storage and cover phone/desktop setup, card dealing, voting, winner wording, editor input, import/export and offline resume. They do not replace a real-device touch/installation check or a full review of every role combination.

For a bug report, include the roles/deck, current day/night and action, exact steps, expected result, actual result, and a screenshot. Do not reset the affected game before noting its History.
