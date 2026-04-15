import { Card, CardHeader, CardTitle, CardContent } from './card';
export default {
  title: 'UI/Card',
  component: Card,
};

export const Default = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Товар</CardTitle>
      </CardHeader>
      <CardContent>Описание товара</CardContent>
    </Card>
  ),
};
