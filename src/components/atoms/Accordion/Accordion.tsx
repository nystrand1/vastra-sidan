import { type ReactNode, useState } from 'react';
import { PiCaretDown } from 'react-icons/pi';

export interface AccordionItemProps {
  title: string;
  content: string | ReactNode;
  isOpen?: boolean;
  toggle?: () => void;
  className?: string
}

interface AccordionProps {
  items: AccordionItemProps[];
  className?: string
}

const AccordionItem: React.FC<AccordionItemProps> = ({
  title,
  content,
  isOpen = false,
  toggle,
  className
}) => {
  return (
    <div className={`divide-y divide-gray-100/25 mx-auto p-4 w-full md:w-96 rounded-lg transition duration-300 ease-in-out bg-slate-800 ${className || ''}`}>
      <button
        className={`w-full text-white text-left flex flex-row justify-between items-center ${isOpen ? 'pb-2' : ''}`}
        onClick={toggle}
      >
        <div className={`text-md font-bold`}>
          {title}
        </div>
        <span>
          <PiCaretDown
            className={`${isOpen ? 'transform rotate-180' : ''
              } transition duration-300 ease-in-out`}
          />
        </span>
      </button>
      {isOpen && (
        <div className="pt-4 space-y-4">
          {typeof content === 'string' ? (
            <p dangerouslySetInnerHTML={{__html: content}} />
          ) : content}
        </div>
      )}
    </div>
  );
};

const Accordion: React.FC<AccordionProps> = ({ items, className = '' }) => {
  const [openItemIndex, setOpenItemIndex] = useState<number | null>(null);

  const toggleItem = (index: number) => {
    setOpenItemIndex((prevIndex) =>
      prevIndex === index ? null : index
    );
  };

  return (
    <div className={`${className}`}>
      {items.map((item, index) => (
        <AccordionItem
          key={index}
          title={item.title}
          content={item.content}
          isOpen={index === openItemIndex}
          toggle={() => toggleItem(index)}
        />
      ))}
    </div>
  );
};

export default Accordion;
