export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <head>
        <link rel="manifest" href="/manifest-dashboard.json" />
        <link rel="apple-touch-icon" href="/icon-pro-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Yoppaa Pro" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#160636" />
      </head>
      {children}
    </>
  )
}