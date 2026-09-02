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

## Automated checks

Validation on 2 September 2026: production build passed; 135 TypeScript tests passed; 21 browser tests passed with five deliberate viewport-specific skips. The provider-free Python base-rules checks, 67 webapp/budget/context tests, and model-evaluation dry run also passed. No paid model calls were made. Screenshots were reviewed at phone and desktop widths; the interactive Codex browser driver was unavailable, so browser verification used the repository's Playwright suite.

The repository includes `src/test/moderator-regressions.test.tsx` and `e2e/moderator-qa.spec.ts`. Run `npm test -- --run`, `npm run build`, and `npm run test:e2e`. Browser tests use isolated storage and cover phone/desktop setup, card dealing, voting, winner wording, editor input, import/export and offline resume. They do not replace a real-device touch/installation check or a full review of every role combination.

For a bug report, include the roles/deck, current day/night and action, exact steps, expected result, actual result, and a screenshot. Do not reset the affected game before noting its History.
