import { Button } from "../Button/Button";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}


export const Modal = ({ isOpen, onClose, children, className = '' } : ModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
      <div className={`bg-slate-900 p-6 rounded-md shadow-md w-80 ${className}`}>
        <div className="mb-4">{children}</div>
        <Button
          onClick={onClose}
          className="w-full md:w-auto"
        >
          Stäng
        </Button>
      </div>
    </div>
  );
}

export default Modal;