export default function Avatar({ name, src, size = 'md', className = '' }: { name: any; src?: any; size?: string; className?: string }) {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-11 h-11 text-base', xl: 'w-14 h-14 text-lg' };
  const displayName = name || 'Usuario';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();

  if (src) {
    return <img src={src} alt={displayName} className={`${(sizes as Record<string, string>)[size] || sizes.md} rounded-full object-cover ${className}`} />;
  }

  return (
    <div
      className={`${(sizes as Record<string, string>)[size]} rounded-full bg-primary-100 text-primary-700 font-semibold flex items-center justify-center ${className}`}
      role="img"
      aria-label={displayName}
    >
      {initials}
    </div>
  );
}
