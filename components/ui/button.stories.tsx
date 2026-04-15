import { Button } from './button';
export default {
  title: 'UI/Button',
  component: Button,
};

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
