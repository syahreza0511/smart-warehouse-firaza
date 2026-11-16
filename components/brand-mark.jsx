// Light lockup (Concept C, frozen R5 mark) for light surfaces: the mark is an
// unmodified SVG asset and the wordmark is live HTML text in Forest. The mark
// is decorative because the text next to it carries the name.
export function BrandLockup({ compact = false }) {
  const size = compact ? 40 : 60;
  return (
    <div className="flex items-center gap-3 text-forest">
      <img
        src="/brand/firaza-app-mark-c-light.svg"
        alt=""
        width={size}
        height={size}
        className={compact ? "size-10 shrink-0" : "size-12 shrink-0 sm:size-15"}
      />
      <div className="grid leading-none">
        <span className={compact ? "text-xl font-bold tracking-[2px]" : "text-2xl font-bold tracking-[3px] sm:text-[30px]"}>
          FIRAZA
        </span>
        <span className={compact ? "mt-1.5 text-[10px] font-semibold tracking-[1.2px]" : "mt-2 text-[11.5px] font-semibold tracking-[2px]"}>
          SMART WAREHOUSE
        </span>
      </div>
    </div>
  );
}
