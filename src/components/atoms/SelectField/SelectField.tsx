

interface SelectFieldProps extends React.InputHTMLAttributes<HTMLSelectElement>  {
  options: { value: string; label: string, disabled: boolean }[];
  label: string,
  labelProps?: React.LabelHTMLAttributes<HTMLLabelElement>,
}

export const SelectField = ({ id, label, options, name, labelProps, placeholder, ...props } : SelectFieldProps) => {
  return (
    <div>
      <label
        htmlFor={id}
        className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
        {...labelProps}>
          {label}
        </label>
        <select
          id={id}
          name={name}
          placeholder={placeholder}
          className="bg-transparent w-full px-4 py-2 border-gray-300 text-slate-50 leading-6 text-gray-900 border rounded-lg shadow-sm focus:ring focus:ring-opacity-50 focus:ring-blue-500"
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
    </div>
  );
};