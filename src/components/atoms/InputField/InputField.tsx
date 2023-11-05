import { useState } from "react";


export interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string,
  labelProps?: React.LabelHTMLAttributes<HTMLLabelElement>,
}


export const InputField = ({className = '', label, labelProps, ...props} : InputFieldProps) => {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="relative">
      <label
        htmlFor={props.id}
        className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
        {...labelProps}>
          {label}
        </label>
      <input
        className={`bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 ${className}`}
        {...props}
        type={showPassword ? 'text' : props.type}
        />
      {props.type === 'password' && (
        <span onClick={() => setShowPassword(!showPassword)} className="absolute right-5 top-10 text-xs">{showPassword ? 'Dölj' : 'Visa'}</span>
      )}
  </div>
  )
};