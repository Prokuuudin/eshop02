import { Card, CardHeader, CardTitle, CardContent } from './card';
const meta = {
  title: 'UI/Card',
  component: Card,
};

export default meta;

export const Default = {
  render: (): React.ReactElement => (
    <Card>
      <CardHeader>
        <CardTitle>Товар</CardTitle>
      </CardHeader>
      <CardContent>Описание товара</CardContent>
    </Card>
  ),
};
