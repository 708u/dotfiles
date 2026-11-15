#!/usr/bin/perl
# 標準入力から、日本語を含み natural-japanese の finalize.sh で承認されていない行を出力する。
#
# 使い方: check-approved.pl <mode> <承認済みのディレクトリ> [既存のファイル]
#
# mode は各行のどの部分をチェックするかを決める。
# - text: HTML タグを除いた行全体。Markdown 内に書かれたタグも除去する
# - code: コメント部分のみ。文字列リテラルなどの中の日本語はチェックしない
#
# 既存のファイルにすでにある文は、移動や改行位置の変更であるため、承認済みとして扱う。
use strict;
use warnings;
use utf8;
use open qw(:std :encoding(UTF-8));

my ($mode, $approved_dir, $existing_path) = @ARGV;
die "usage: $0 <text|code> <approved-dir> [existing-file]\n" unless $mode && $approved_dir;

# 数日前に承認されたテキストは、同じ文を別の場所に投稿する場合でも使われないため、除外する
my $retention_days = 7;

# 書き込み先で箇条書きやテーブルの書式が異なる場合でもチェックが機能するよう、
# スペースと Markdown 記号を除いて比較する
sub normalize {
    my ($s) = @_;
    $s =~ s/^\s*\d+[.)]\s+//gm;
    $s =~ s/[\s\x{3000}|*_`#>+\-]+//g;
    return $s;
}

sub slurp {
    my ($path) = @_;
    open my $fh, '<', $path or return '';
    local $/;
    my $s = <$fh>;
    close $fh;
    return defined $s ? $s : '';
}

my $approved = '';
if (opendir my $dh, $approved_dir) {
    for my $name (readdir $dh) {
        my $path = "$approved_dir/$name";
        next unless -f $path && -M $path < $retention_days;
        $approved .= normalize(slurp($path)) . "\n";
    }
    closedir $dh;
}

my $existing = '';
if (defined $existing_path && -f $existing_path) {
    $existing = slurp($existing_path);
    $existing =~ s/<[^>]*>//g if $mode eq 'text';
    $existing = normalize($existing);
}

for my $line (<STDIN>) {
    chomp $line;
    my $target = $line;
    if ($mode eq 'text') {
        $target =~ s/<[^>]*>//g;
    } else {
        if ($target =~ m{^\s*(?://+|#+|--|;+|/\*+|\*+|<!--)\s?(.*)$}) {
            $target = $1;
        } elsif ($target =~ m{\s(?://|#)\s+(.*)$}) {
            $target = $1;
        } else {
            next;
        }
        $target =~ s{\s*(?:\*/|-->)\s*$}{};
    }
    # テーブル行の各セルを承認済みテキストと比較する
    my $unapproved = 0;
    for my $sentence (map { split /(?<=。)/ } split /\|/, $target) {
        next unless $sentence =~ /[\p{Hiragana}\p{Katakana}\p{Han}]/;
        my $n = normalize($sentence);
        next if $n eq '' || index($existing, $n) >= 0 || index($approved, $n) >= 0;
        $unapproved = 1;
        last;
    }
    print "$line\n" if $unapproved;
}
