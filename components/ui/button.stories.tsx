import { Button } from './button';
const meta = {
  title: 'UI/Button',
  component: Button,
};

export default meta;

export const Default = {
  args: {
    children: 'Купить',
  },
};

export const Disabled = {
  args: {
    children: 'Disabled',
    disabled: true,
  },
};
