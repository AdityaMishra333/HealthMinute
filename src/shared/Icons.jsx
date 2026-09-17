const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Svg({ size = 18, children, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} {...rest}>
      {children}
    </svg>
  );
}

export function IconPin(props) {
  return (
    <Svg {...props}>
      <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.4" />
    </Svg>
  );
}

export function IconCamera(props) {
  return (
    <Svg {...props}>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="14" r="3.4" />
    </Svg>
  );
}

export function IconMic(props) {
  return (
    <Svg {...props}>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21M8.5 21h7" />
    </Svg>
  );
}

export function IconChat(props) {
  return (
    <Svg {...props}>
      <path d="M4 5h16v11H8l-4 4V5Z" />
      <path d="M8 9h8M8 12.5h5" />
    </Svg>
  );
}

export function IconPhone(props) {
  return (
    <Svg {...props}>
      <path d="M5 4.5h3.2l1.4 4.2-2 1.6a11.5 11.5 0 0 0 5.6 5.6l1.6-2 4.2 1.4V18a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 3.5 6.1 1.5 1.5 0 0 1 5 4.5Z" />
    </Svg>
  );
}

export function IconAmbulance(props) {
  return (
    <Svg {...props}>
      <path d="M3 16V8a1 1 0 0 1 1-1h9v9H3Z" />
      <path d="M13 11h4.5l2.5 3v2h-7z" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17.5" cy="18" r="1.6" />
      <path d="M7 5.5v3M5.5 7h3" />
    </Svg>
  );
}

export function IconHospital(props) {
  return (
    <Svg {...props}>
      <path d="M5 21V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v16" />
      <path d="M3 21h18" />
      <path d="M12 8v6M9 11h6" />
      <path d="M9 21v-4h6v4" />
    </Svg>
  );
}

export function IconCheck(props) {
  return (
    <Svg {...props}>
      <path d="M5 12.5 9.5 17 19 7" />
    </Svg>
  );
}

export function IconClock(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

export function IconShare(props) {
  return (
    <Svg {...props}>
      <circle cx="18" cy="5" r="2.2" />
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="18" cy="19" r="2.2" />
      <path d="M8 10.8 16 6.2M8 13.2l8 4.6" />
    </Svg>
  );
}

export function IconLogout(props) {
  return (
    <Svg {...props}>
      <path d="M9 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h3" />
      <path d="M14 8.5 18.5 13 14 17.5" />
      <path d="M18.2 13H9" />
    </Svg>
  );
}

export function IconBed(props) {
  return (
    <Svg {...props}>
      <path d="M3 18v-8a2 2 0 0 1 2-2h5v4" />
      <path d="M3 15h18v3" />
      <path d="M10 12h9a2 2 0 0 1 2 2v1" />
      <circle cx="6.5" cy="9.5" r="1.4" />
    </Svg>
  );
}

export function IconChart(props) {
  return (
    <Svg {...props}>
      <path d="M4 20V10M10 20V4M16 20v-7M4 20h16" />
    </Svg>
  );
}

export function IconAlert(props) {
  return (
    <Svg {...props}>
      <path d="M12 3 21.5 20H2.5L12 3Z" />
      <path d="M12 9.5V14M12 17h.01" />
    </Svg>
  );
}

export function IconNavigate(props) {
  return (
    <Svg {...props}>
      <path d="m12 3 8 16-8-3.5L4 19l8-16Z" />
    </Svg>
  );
}

export function IconChevronDown(props) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function IconArrowLeft(props) {
  return (
    <Svg {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Svg>
  );
}

export function IconHome(props) {
  return (
    <Svg {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
      <path d="M10 20v-5h4v5" />
    </Svg>
  );
}

export function IconBell(props) {
  return (
    <Svg {...props}>
      <path d="M6 10.5a6 6 0 0 1 12 0c0 3.6 1 5 1.5 5.5H4.5c.5-.5 1.5-1.9 1.5-5.5Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </Svg>
  );
}

export function IconRecenter(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 3v3.2M12 17.8V21M21 12h-3.2M6.2 12H3" />
    </Svg>
  );
}

export function IconInstall(props) {
  return (
    <Svg {...props}>
      <path d="M12 3v11" />
      <path d="m7.5 10 4.5 4 4.5-4" />
      <path d="M4 17.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5" />
    </Svg>
  );
}

export function IconRefresh(props) {
  return (
    <Svg {...props}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4h-4" />
    </Svg>
  );
}

export function IconClose(props) {
  return (
    <Svg {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Svg>
  );
}

export function IconWifiOff(props) {
  return (
    <Svg {...props}>
      <path d="M2 8.5a16 16 0 0 1 4.5-3M8.5 5.5A16 16 0 0 1 22 8.5" />
      <path d="M5.5 12.5a11 11 0 0 1 4-2.3M14.5 10.2a11 11 0 0 1 4 2.3" />
      <path d="M9 16.3a6 6 0 0 1 6 0" />
      <circle cx="12" cy="19.5" r="1.1" fill="currentColor" stroke="none" />
      <path d="M2 2l20 20" />
    </Svg>
  );
}

export function IconLocationOff(props) {
  return (
    <Svg {...props}>
      <path d="M19 9.5c0 4.2-5.2 9.2-6.6 10.5a.6.6 0 0 1-.8 0C10.6 19 7 15.4 5.6 12" />
      <path d="M5.2 9.5A7 7 0 0 1 12 2.5c1.7 0 3.3.62 4.5 1.65" />
      <circle cx="12" cy="9.5" r="2.4" />
      <path d="M2 2l20 20" />
    </Svg>
  );
}

export function IconList(props) {
  return (
    <Svg {...props}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="3.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="18" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconMapPin(props) {
  return (
    <Svg {...props}>
      <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
      <path d="M9.5 9.5h5M9.5 9.5l1.2-2.2h2.6l1.2 2.2" />
    </Svg>
  );
}

export function IconUsers(props) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
      <path d="M16 8.5a2.6 2.6 0 1 0 0-5.2" />
      <path d="M14.5 13.7c2.6.3 4.6 2.6 4.6 5.3" />
    </Svg>
  );
}

export function IconInbox(props) {
  return (
    <Svg {...props}>
      <path d="M3 12.5 5.5 5a1 1 0 0 1 1-.7h11a1 1 0 0 1 1 .7l2.5 7.5" />
      <path d="M3 12.5h5l1.5 2.5h5l1.5-2.5h5" />
      <path d="M3 12.5V18a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5.5" />
    </Svg>
  );
}
