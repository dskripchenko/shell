# shell integration: started in place of ~/.bashrc; first what a login shell reads.
[ -f /etc/profile ] && . /etc/profile
__marks_profile=
for __marks_f in ~/.bash_profile ~/.bash_login ~/.profile; do
  if [ -f "$__marks_f" ]; then . "$__marks_f"; __marks_profile=1; break; fi
done
[ -z "$__marks_profile" ] && [ -f ~/.bashrc ] && . ~/.bashrc
unset __marks_f __marks_profile

# The commands marked (OSC 133, 633;E) and the folder said (OSC 7).
__marks_ran=
__marks_in_prompt=
__marks_prompt() {
  if [ -n "$__marks_ran" ]; then
    printf '\e]133;D;%s\a' "$__marks_ret"
    __marks_ran=
  fi
  printf '\e]7;file://%s%s\a' "$HOSTNAME" "${PWD// /%20}"
  printf '\e]133;A\a'
}
__marks_mark_input() {
  case "$PS1" in *'133;B'*) ;; *) PS1="$PS1"'\[\e]133;B\a\]' ;; esac
}
__marks_preexec() {
  [ -n "$COMP_LINE" ] && return
  [ -n "$__marks_in_prompt" ] && return
  case "$BASH_COMMAND" in __marks_*) return ;; esac
  [ -n "$__marks_ran" ] && return
  __marks_ran=1
  local cmd
  cmd=$(HISTTIMEFORMAT= history 1 | sed 's/^ *[0-9]* *//')
  # History off (some profiles turn it off) or not kept yet: the command being run.
  [ -z "$cmd" ] && cmd=$BASH_COMMAND
  cmd=${cmd//\\/\\\\}
  cmd=${cmd//;/\\x3b}
  printf '\e]633;E;%s\a' "$cmd"
  printf '\e]133;C\a'
}
# PROMPT_COMMAND may be an array (bash 5.1+; systemd's profile adds to it on Ubuntu 26.04): every
# part of it runs inside the marks' prompt, so none is taken for a command typed.
__marks_pc=
for __marks_c in "${PROMPT_COMMAND[@]}"; do [ -n "$__marks_c" ] && __marks_pc="$__marks_pc$__marks_c; "; done
unset PROMPT_COMMAND
PROMPT_COMMAND="__marks_ret=\$?; __marks_in_prompt=1; __marks_prompt; ${__marks_pc}__marks_mark_input; __marks_in_prompt="
unset __marks_c __marks_pc
# Last: set before, the trap would take the lines above for commands typed.
trap '__marks_preexec' DEBUG
