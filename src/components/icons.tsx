import type { SVGProps } from "react";

/** Ícones em linha (traço 1.75), no estilo do protótipo. */

type P = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 16, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

export function NexoMark({ size = 24, color = "#1B2431" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24.388 20.639" aria-hidden>
      <path
        d="M21.763 .245l-3.374 1.687c-.623 .308-.973 .903-.973 1.631v6.293l-11.193-9.429c-.623-.469-1.372-.553-2.03-.245l-3.185 1.631c-.651 .322-1.008 .924-1.008 1.673v15.218c0 1.477 1.526 2.289 2.716 1.785l3.073-1.617c.693-.322 1.057-.952 1.057-1.722v-7.7l11.732 10.591c.602 .546 1.421 .679 2.086 .364l2.786-1.505c.602-.315 .938-.931 .938-1.68v-15.288c0-1.463-1.505-2.275-2.625-1.687z"
        fill={color}
      />
    </svg>
  );
}

export const IconMail = (p: P) => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </Base>
);
export const IconLock = (p: P) => (
  <Base {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Base>
);
export const IconEye = (p: P) => (
  <Base {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Base>
);
export const IconEyeOff = (p: P) => (
  <Base {...p}>
    <path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
  </Base>
);
export const IconArrowRight = (p: P) => (
  <Base {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Base>
);
export const IconCheck = (p: P) => (
  <Base {...p}>
    <path d="m5 12 5 5 9-10" />
  </Base>
);
export const IconChat = (p: P) => (
  <Base {...p}>
    <path d="M4 5h16v11H8l-4 4V5Z" />
  </Base>
);
export const IconUser = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Base>
);
export const IconLogout = (p: P) => (
  <Base {...p}>
    <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
  </Base>
);
export const IconChevronRight = (p: P) => (
  <Base {...p}>
    <path d="m9 6 6 6-6 6" />
  </Base>
);
export const IconChevronDown = (p: P) => (
  <Base {...p}>
    <path d="m6 9 6 6 6-6" />
  </Base>
);
export const IconSend = (p: P) => (
  <Base {...p}>
    <path d="M4 12 20 4l-6 16-3-7-7-1Z" />
  </Base>
);
export const IconSearch = (p: P) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Base>
);
export const IconMore = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="19" r="1" />
  </Base>
);
export const IconTicket = (p: P) => (
  <Base {...p}>
    <path d="M3 8V6h18v2a2 2 0 0 0 0 4v2H3v-2a2 2 0 0 0 0-4Z" transform="translate(0 2)" />
  </Base>
);
export const IconBook = (p: P) => (
  <Base {...p}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" />
    <path d="M4 19a2 2 0 0 1 2-2h13" />
  </Base>
);
export const IconGauge = (p: P) => (
  <Base {...p}>
    <path d="M4 18a8 8 0 1 1 16 0" />
    <path d="m12 14 4-5" />
  </Base>
);
export const IconClock = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Base>
);
export const IconFile = (p: P) => (
  <Base {...p}>
    <path d="M6 3h8l4 4v14H6V3Z" />
    <path d="M14 3v4h4M9 13h6M9 17h4" />
  </Base>
);
export const IconHeadset = (p: P) => (
  <Base {...p}>
    <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
    <rect x="3" y="14" width="4" height="6" rx="1.5" />
    <rect x="17" y="14" width="4" height="6" rx="1.5" />
  </Base>
);
export const IconAlert = (p: P) => (
  <Base {...p}>
    <path d="M12 4 2.5 20h19L12 4Z" />
    <path d="M12 10v4M12 17h.01" />
  </Base>
);
export const IconInfo = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Base>
);
export const IconShield = (p: P) => (
  <Base {...p}>
    <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
  </Base>
);
export const IconKey = (p: P) => (
  <Base {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 9-9M17 6l3 3" />
  </Base>
);
export const IconRefresh = (p: P) => (
  <Base {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
  </Base>
);
export const IconX = (p: P) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);
export const IconPencil = (p: P) => (
  <Base {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
  </Base>
);
export const IconSparkle = (p: P) => (
  <Base {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
  </Base>
);
export const IconPlus = (p: P) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);
