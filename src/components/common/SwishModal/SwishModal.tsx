import { useRouter } from "next/router";
import { Button } from "~/components/atoms/Button/Button";
import Modal from "~/components/atoms/Modal/Modal";
import { Spinner } from "~/components/atoms/Spinner/Spinner";

export const SwishModal = () => {
  const router = useRouter();
  const swishUrl = "swish://paymentrequest?token=c28a4061470f4af48973bd2a4642b4fa&callbackurl=merchant%253A%252F%252F";

  const openSwishApp = async () => {
    await router.push(swishUrl);
  }

  return (
    <Modal
      isOpen
      onClose={() => {console.log("close")}}
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