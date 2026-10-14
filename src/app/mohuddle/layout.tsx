/* The Mohuddle product site has its own look, apart from any agency's public website. */
export default function MohuddleLayout({ children }: { children: React.ReactNode }) {
  return <div className="mh-page min-h-screen">{children}</div>;
}
