export interface TextAreaProps extends React.InputHTMLAttributes<HTMLTextAreaElement> {
  label: string,
  labelProps?: React.LabelHTMLAttributes<HTMLLabelElement>,
  placeholder?: string,
}


export const TextArea = ({ placeholder, labelProps, label, className = '', ...props } : TextAreaProps) => {
  return (
    <div>
      <label
        htmlFor={props.id}
        className="block mb-2 text-sm font-medium text-white"
        {...labelProps}>
          {label}
        </label>
      <textarea
        className={`text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white focus:ring-blue-500 focus:border-blue-500 ${className}`}
        placeholder={placeholder}
        {...props}
      ></textarea>

    </div>
  );
};
