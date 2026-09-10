import React from 'react';

/**
 * The XTRA mark, cut from the logo that is already in the project.
 *
 * One component so the brand looks identical everywhere it appears — the
 * header, the sign-in screen, the tab icon — rather than three slightly
 * different crops that drift apart over time.
 *
 * `wordmark` is the full lockup, for places with room to breathe. The default
 * is the X alone, which is what survives at the size a navigation bar allows;
 * the wordmark's "GIFTCARD" line becomes an illegible smudge below about 80px.
 */
export function XtraMark({
  wordmark = false,
  className = '',
  alt = 'XTRA'
}: {
  wordmark?: boolean;
  className?: string;
  alt?: string;
}) {
  return wordmark ? (
    <img src="/xtra-logo.png" alt={alt} width={180} height={111} className={className} />
  ) : (
    <img src="/xtra-mark.png" alt={alt} width={512} height={512} className={className} />
  );
}
