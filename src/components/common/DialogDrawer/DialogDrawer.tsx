import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '~/components/ui/dialog';
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '~/components/ui/drawer';
import useMediaQuery from '~/hooks/useMediaQuery';

interface DialogDrawerProps {
  content: React.ReactNode;
  trigger: React.ReactNode;
  closeTrigger?: React.ReactNode;
  title?: React.ReactNode;
  setOpen?: (open: boolean) => void;
  open?: boolean;
  className?: string;
  disableOutsideClick?: boolean;
}

export default function DialogDrawer({
  title,
  closeTrigger,
  content,
  trigger,
  open,
  setOpen,
  className,
  disableOutsideClick,
}: DialogDrawerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    if (isMobile) {
      setDialogOpen(false);
    } else {
      setDrawerOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (open === undefined) return;
    if (isMobile) {
      setDrawerOpen(open);
    } else {
      setDialogOpen(open);
    }
  }, [open, isMobile]);

  const handleDialogOpen = (open: boolean) => {
    if (setOpen) {
      setOpen(open);
    } else {
      setDialogOpen(open);
    }
  };

  const handleDrawerOpen = (open: boolean) => {
    if (setOpen) {
      setOpen(open);
    } else {
      setDrawerOpen(open);
    }
  };

  return (
    <div>
      {!isMobile && (
        <div className="hidden md:block">
          <Dialog open={dialogOpen} onOpenChange={() => handleDialogOpen(!dialogOpen)}>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent
              {...disableOutsideClick && {
                onInteractOutside(event) {
                  event.preventDefault();
                },
              }}
              className={className}
            >
              {title && <DialogTitle>{title}</DialogTitle>}
              {content}
              {closeTrigger && <DialogTrigger asChild>{closeTrigger}</DialogTrigger>}
            </DialogContent>
          </Dialog>
        </div>
      )}
      {isMobile && (
        <div className="md:hidden">
          <Drawer open={drawerOpen} onOpenChange={() => handleDrawerOpen(!drawerOpen)}>
            <DrawerTrigger asChild>{trigger}</DrawerTrigger>
            <DrawerContent 
              {...disableOutsideClick && {
                onInteractOutside(event) {
                  event.preventDefault();
                },
              }}
              className={className}
            >
              <DrawerHeader className="text-left">
                {title && <DrawerTitle>{title}</DrawerTitle>}
                {content}
                {closeTrigger && <DrawerClose asChild>{closeTrigger}</DrawerClose>}
              </DrawerHeader>
            </DrawerContent>
          </Drawer>
        </div>
      )}
    </div>
  );
}
