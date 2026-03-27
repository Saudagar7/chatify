function BorderAnimatedContainer({ children }) {
  const style = {
    background:
      "linear-gradient(45deg,var(--panel-left),var(--panel-right) 50%,var(--panel-left)) padding-box,conic-gradient(from var(--border-angle),var(--border) 78%,var(--accent) 86%,var(--accent) 90%,var(--border) 98%) border-box",
  };

  return (
    <div className="w-full h-full rounded-2xl border border-transparent animate-border flex overflow-hidden" style={style}>
      {children}
    </div>
  );
}

export default BorderAnimatedContainer;