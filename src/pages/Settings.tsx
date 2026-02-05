import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Moon, Sun, Monitor, Bell } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme/ThemeProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useOutletContext } from 'react-router-dom';

interface LayoutContext {
  onOpenSidebar: () => void;
  onOpenDiffPanel: () => void;
}

export function Settings() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { onOpenSidebar } = useOutletContext<LayoutContext>();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  const handleNotificationToggle = async (checked: boolean) => {
    if (!('Notification' in window)) {
      alert('This browser does not support notifications');
      return;
    }

    if (checked) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      setNotificationsEnabled(permission === 'granted');
      
      if (permission === 'granted') {
        // Send a test notification
        new Notification('Notifications enabled', {
          body: 'You will now receive updates about your sessions',
          icon: '/favicon.ico',
        });
      }
    } else {
      setNotificationsEnabled(false);
    }
  };

  const themes = [
    { id: 'light' as const, name: 'Light', icon: Sun, description: 'Clean and bright' },
    { id: 'dark' as const, name: 'Dark', icon: Moon, description: 'Easy on the eyes' },
    { id: 'system' as const, name: 'System', icon: Monitor, description: 'Follows your OS' },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="shrink-0 border-b">
        <div className="max-w-3xl mx-auto px-4 h-12 flex items-center gap-3">
          <button
            onClick={onOpenSidebar}
            className="md:hidden p-1.5 -ml-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Open sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="font-medium text-sm">Settings</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appearance</CardTitle>
            <CardDescription>Choose your preferred theme</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {themes.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={cn(
                      'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
                      theme === t.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/25'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-sm font-medium">{t.name}</span>
                    <span className="text-xs text-muted-foreground">{t.description}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notifications
            </CardTitle>
            <CardDescription>Manage your notification preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">Enable notifications</label>
                <p className="text-xs text-muted-foreground">
                  {notificationPermission === 'denied' 
                    ? 'Blocked in browser settings' 
                    : 'Receive updates about your sessions'}
                </p>
              </div>
              <Switch 
                checked={notificationsEnabled}
                onCheckedChange={handleNotificationToggle}
                disabled={notificationPermission === 'denied'}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">Sound effects</label>
                <p className="text-xs text-muted-foreground">Play sounds for important events</p>
              </div>
              <Switch 
                checked={soundEnabled}
                onCheckedChange={setSoundEnabled}
              />
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground pt-4">
          Version 1.0.0
        </p>
      </main>
    </div>
  );
}
