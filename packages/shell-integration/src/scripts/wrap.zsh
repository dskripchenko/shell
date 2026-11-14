# shell integration: the user's own __FILE__ first.
if [[ -f "${SHELL_INTEGRATION_USER_ZDOTDIR}/__FILE__" ]]; then
  SHELL_INTEGRATION_ZDOTDIR=${ZDOTDIR}
  ZDOTDIR=${SHELL_INTEGRATION_USER_ZDOTDIR}
  . "${SHELL_INTEGRATION_USER_ZDOTDIR}/__FILE__"
  # It may have moved ZDOTDIR itself: the next files are read from there.
  SHELL_INTEGRATION_USER_ZDOTDIR=${ZDOTDIR}
  ZDOTDIR=${SHELL_INTEGRATION_ZDOTDIR}
fi
