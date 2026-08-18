# Threat model

Keep this short and current. Its job is to state trust assumptions
explicitly so they can be checked, not to be exhaustive.

## Trusted parties / keys

<!-- List every key, wallet, role, or service account that has real power
in this system, and exactly what it can do. Example: -->
- `RELAYER_PRIVATE_KEY` — pays gas for sponsored transactions. Can spend
  its own gas balance; cannot move user funds directly.
- `<admin role / owner address>` — can pause/upgrade `<contract>`. Held by
  <EOA / multisig / etc>.

## What happens if each one is compromised

<!-- For each entry above, one or two sentences: what's the actual blast
radius. Example: -->
- If `RELAYER_PRIVATE_KEY` leaks: attacker can drain its gas balance by
  spamming sponsored calls. It cannot move user deposits — worst case is
  a bounded financial loss capped at the relayer's balance, and the relay
  route stops sponsoring transactions once it's empty.

## What's explicitly out of scope

<!-- Say what you haven't defended against, plainly. This is the section
that builds trust — an honest "we haven't hardened X yet" reads better to
a reviewer than silence that turns out to hide the same gap. -->

## Known limitations

<!-- Link to or duplicate the relevant parts of docs/LIMITATIONS.md if you
keep that as a separate file. -->
