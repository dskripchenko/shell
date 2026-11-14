# shell integration: the commands marked (OSC 133, 633;E) and the folder said (OSC 7).
autoload -Uz add-zsh-hook
typeset -g __marks_ran=
__marks_precmd() {
  local ret=$?
  if [[ -n $__marks_ran ]]; then
    printf '\e]133;D;%s\a' "$ret"
    __marks_ran=
  fi
  printf '\e]7;file://%s%s\a' "${HOST}" "${PWD// /%20}"
  printf '\e]133;A\a'
  [[ $PS1 == *'133;B'* ]] || PS1="$PS1%{"$'\e]133;B\a'"%}"
}
__marks_preexec() {
  __marks_ran=1
  local cmd=${1//\\/\\\\}
  cmd=${cmd//;/\\x3b}
  cmd=${cmd//$'\n'/\\x0a}
  printf '\e]633;E;%s\a' "$cmd"
  printf '\e]133;C\a'
}
add-zsh-hook precmd __marks_precmd
add-zsh-hook preexec __marks_preexec
# From here on zsh reads the user's own files (.zlogin) from the user's folder.
ZDOTDIR=${SHELL_INTEGRATION_USER_ZDOTDIR}
unset SHELL_INTEGRATION_USER_ZDOTDIR SHELL_INTEGRATION_ZDOTDIR
