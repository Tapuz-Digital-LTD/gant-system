import React from 'react';

/**
 * The XTRA mark, cut from the logo that is already in the project.
 *
 * One component so the brand looks identical everywhere it appears — the
 * header, the sign-in screen, the tab icon — rather than three slightly
 * different crops that drift apart over time.
 *
 * `wordmark` is the whole logo and is what the product shows — a person should
 * see the company they are working for, not an initial. The X alone exists for
 * the one place a wide lockup cannot go: a browser tab.
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
