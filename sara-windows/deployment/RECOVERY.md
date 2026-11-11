# SARA deployment recovery

Primary-shell activation is disabled unless every safety gate passes. Recovery
must be tested in a separate account or VM before any activation.

Out-of-band procedure:

1. Sign in with the independently tested recovery account.
2. Open PowerShell in the SARA installation directory.
3. Run `npm run deployment:rollback -- -ConfirmRollback`.
4. Verify `explorer.exe` is the active shell and start it if necessary.

This document contains no credentials. Account existence alone is not proof that
the account can log in or restore the shell.
