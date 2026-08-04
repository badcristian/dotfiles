#!/usr/bin/env bash

set -u

mode="${1:-}"
mouse_x="${2:-}"
line="${3:-}"
hyperlink="${4:-}"

if [[ "$mode" != "--open" && "$mode" != "--print" ]]; then
	exit 2
fi

if [[ ! "$mouse_x" =~ ^[0-9]+$ ]]; then
	exit 1
fi

url=""

if [[ "$hyperlink" =~ ^https?:// ]]; then
	url="$hyperlink"
else
	url="$({
		/usr/bin/perl -CS -e '
			use strict;
			use warnings;
			use utf8;
			use Encode qw(decode);

			my ($column, $line) = @ARGV;
			$line = decode("UTF-8", $line);

			while ($line =~ m{https?://[^\s<>"\x27`]+}g) {
				my $start = $-[0];
				my $candidate = substr($line, $start, $+[0] - $start);
				$candidate =~ s/[),.;:!?]+$//;
				my $end = $start + length($candidate);

				if ($column >= $start && $column < $end) {
					print $candidate;
					exit 0;
				}
			}

			exit 1;
		' "$mouse_x" "$line"
	} 2>/dev/null)" || exit 1
fi

if [[ ! "$url" =~ ^https?:// ]]; then
	exit 1
fi

if [[ "$mode" == "--print" ]]; then
	printf '%s\n' "$url"
else
	/usr/bin/open "$url"
fi
