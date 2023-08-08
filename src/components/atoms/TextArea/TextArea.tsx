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
        className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
        {...labelProps}>
          {label}
        </label>
      <textarea
        className={`bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 ${className}`}
        placeholder={placeholder}
      ></textarea>

    </div>
  );
};
