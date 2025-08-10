# react-blender-nodes

- Inspired by blender nodes, a react solution to render blender-like nodes on
  the web using react, check out blender's official repo
  [here](https://projects.blender.org/blender/blender.git).
- Thanks to blender foundation for their awesome work and keeping blender free
  and open source!<br>
- Please donate to blender foundation if you can
  [here](https://fund.blender.org/).
- This project is not affiliated with blender, it's just to satisfy my curiosity
  on how such a project would look like.

## Project Design

### Folder Structure

<details>
  <summary>Root</summary>

- <details>
    <summary>src</summary>
    
    - <details>
        <summary>components</summary>

        - atoms contains one folder per component (only components that can't be divided further)
          - every folder has the component, its stories, etc
        - molecules contains one folder per component (only components that are only composed of atoms)
          - every folder has the component, its stories, etc
        - organisms contains one folder per component (all other components)
          - every folder has the component, its stories, etc

      </details>

  - state management, global utils

  </details>

- package,git,typescript,vite,prettier,storybook configs
- license (MIT)
- Readme (This page)

</details>
