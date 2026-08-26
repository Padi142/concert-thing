#!/usr/bin/env bash
set -euo pipefail

# Android Gradle builds need a full JDK. EAS can otherwise inherit Fedora's
# Java runtime (currently Java 25), which has no javac and fails as a Gradle
# toolchain with "does not provide [JAVA_COMPILER]".
candidates=(
  "${JAVA_HOME:-}"
  "$HOME/.jdks/temurin-17"
  "$HOME/.jdks/temurin-21"
  "$HOME/.jdks"/*
  /usr/lib/jvm/java-17-openjdk
  /usr/lib/jvm/java-21-openjdk
)

for candidate in "${candidates[@]}"; do
  if [[ -x "$candidate/bin/java" && -x "$candidate/bin/javac" ]] \
    && "$candidate/bin/java" -version 2>&1 | grep -Eq 'version "(17|21)([.]|\\")'; then
    export JAVA_HOME="$candidate"
    export PATH="$JAVA_HOME/bin:$PATH"
    break
  fi
done

if [[ ! -x "${JAVA_HOME:-}/bin/javac" ]]; then
  echo "A full JDK 17 or 21 is required (java alone is not enough)." >&2
  echo "Install one, then retry; for example: sudo dnf install java-21-openjdk-devel" >&2
  exit 1
fi

echo "Using JAVA_HOME=$JAVA_HOME"
java -version
pnpm exec eas build --platform android --profile production --local "$@"
