import { useState } from 'react';
import { Bell, X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import { Badge, Card, CardBody, Button } from './ui';
import { cn } from '@/utils';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationCenterProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClear: () => void;
}

export default function NotificationCenter({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onClear,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return CheckCircle;
      case 'error':
        return XCircle;
      case 'warning':
        return AlertTriangle;
      default:
        return Info;
    }
  };

  const getColor = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return 'text-success-600 bg-success-50';
      case 'error':
        return 'text-danger-600 bg-danger-50';
      case 'warning':
        return 'text-warning-600 bg-warning-50';
      default:
        return 'text-primary-600 bg-primary-50';
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-secondary-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-4 h-4 bg-danger-600 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <Card className="absolute top-full right-0 mt-2 z-50 w-80 shadow-xl max-h-96 overflow-hidden">
            <CardBody className="p-0">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="font-semibold text-secondary-900">
                  Bildirimler
                  {unreadCount > 0 && (
                    <Badge variant="primary" className="ml-2">
                      {unreadCount}
                    </Badge>
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onMarkAllAsRead}
                    >
                      Tümünü Okundu İşaretle
                    </Button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 text-secondary-400 hover:text-secondary-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto max-h-80">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-secondary-500">
                    <Bell className="w-12 h-12 mx-auto mb-2 text-secondary-300" />
                    <p>Bildirim yok</p>
                  </div>
                ) : (
                  <div className="divide-y divide-secondary-100">
                    {notifications.map((notification) => {
                      const Icon = getIcon(notification.type);
                      return (
                        <div
                          key={notification.id}
                          className={cn(
                            'p-4 hover:bg-secondary-50 transition-colors cursor-pointer',
                            !notification.read && 'bg-primary-50'
                          )}
                          onClick={() => {
                            if (!notification.read) {
                              onMarkAsRead(notification.id);
                            }
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={cn(
                                'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                                getColor(notification.type)
                              )}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p
                                  className={cn(
                                    'text-sm font-medium',
                                    !notification.read && 'font-semibold'
                                  )}
                                >
                                  {notification.title}
                                </p>
                                {!notification.read && (
                                  <span className="w-2 h-2 bg-primary-600 rounded-full flex-shrink-0 mt-1.5" />
                                )}
                              </div>
                              <p className="text-xs text-secondary-600 mt-1">
                                {notification.message}
                              </p>
                              <p className="text-xs text-secondary-400 mt-1">
                                {new Date(notification.timestamp).toLocaleString('tr-TR')}
                              </p>
                              {notification.action && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="mt-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    notification.action?.onClick();
                                  }}
                                >
                                  {notification.action.label}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {notifications.length > 0 && (
                <div className="p-3 border-t bg-secondary-50">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClear}
                    className="w-full"
                  >
                    Tümünü Temizle
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

