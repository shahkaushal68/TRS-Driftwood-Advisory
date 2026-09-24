import { Anchor, polymorphic } from '@mantine/core'
import type { AnchorProps, PolymorphicComponentProps } from '@mantine/core'
import { Link as RouterLink } from '@tanstack/react-router'

export type LinkProps = PolymorphicComponentProps<typeof RouterLink, AnchorProps>

export const Link = polymorphic<typeof RouterLink, AnchorProps>(
  ({ component, ...props }: LinkProps) => <Anchor component={component ?? RouterLink} {...props} />,
)

Link.displayName = 'Link'
