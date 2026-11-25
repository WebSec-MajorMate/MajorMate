"use client";

import Image from "next/image";

export function PosterImage({ src }: { src: string }) {
  return (
    <Image src={src} alt="" fill unoptimized className="activities-preview"
      sizes="(max-width: 680px) 50vw, (max-width: 960px) 33vw, 25vw"
      referrerPolicy="no-referrer"
      onError={(event) => { event.currentTarget.style.display = "none"; }} />
  );
}
