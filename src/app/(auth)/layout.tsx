export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0c1222] via-[#0c4a6e] to-[#0891b2]">
      {children}
    </div>
  );
}
