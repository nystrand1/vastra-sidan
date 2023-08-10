import { useRouter } from "next/router";
import { Button } from "~/components/atoms/Button/Button";
import Modal from "~/components/atoms/Modal/Modal";
import { Spinner } from "~/components/atoms/Spinner/Spinner";

interface SwishModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SwishModal = ({ isOpen, onClose } : SwishModalProps) => {
  const router = useRouter();
  const swishUrl = "swish://paymentrequest";

  const openSwishApp = async () => {
    await router.push(swishUrl);
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
    >
      <div className="space-y-4">
        <h4 className="text-xl">Swish</h4>
        <Spinner />
        <p>Öppna Swish på din mobil för att betala</p>
        <Button className="md:hidden w-full" onClick={openSwishApp}>Öppna Swish</Button>
      </div>
    </Modal>
  )
}