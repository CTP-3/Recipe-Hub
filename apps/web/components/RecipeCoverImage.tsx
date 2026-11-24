"use client";

import { useEffect, useState } from "react";

type Props = {
  src: string | null;
  alt: string;
  className: string;
};

export default function RecipeCoverImage({ src, alt, className }: Props) {
  const [unavailable, setUnavailable] = useState(!src);

  useEffect(() => {
    setUnavailable(!src);
  }, [src]);

  if (!src || unavailable) {
    return (
      <p className="text-sm text-stone-500" role="status">
        Cover image unavailable.
      </p>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setUnavailable(true)}
    />
  );
}
