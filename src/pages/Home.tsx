import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

export function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to the default session (s1) if on home
    navigate('/session/s1', { replace: true });
  }, [navigate]);

  return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground">
      <div className="flex flex-col items-center gap-4">
        <Sparkles className="w-8 h-8" />
        <p>Redirecting...</p>
      </div>
    </div>
  );
}
