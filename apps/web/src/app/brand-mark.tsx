import Image from "next/image";

export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden rounded-xl bg-violet-500/10 shadow-[0_10px_30px_rgba(139,92,246,0.22)]"
      style={{ height: size, width: size }}
    >
      <Image
        alt=""
        aria-hidden="true"
        height={size}
        priority
        src="/brand-mark.png"
        width={size}
      />
    </div>
  );
}
